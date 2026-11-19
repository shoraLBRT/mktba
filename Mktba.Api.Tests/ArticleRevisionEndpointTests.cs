using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;

namespace Mktba.Api.Tests;

/// <summary>M-04 (#25): saves write revisions with the saving admin; history and rollback are admin-only.</summary>
public sealed class ArticleRevisionEndpointTests : IClassFixture<MktbaApiFactory>
{
    private const string AdminEmail = "admin@mktba.test";

    private readonly MktbaApiFactory _factory;

    public ArticleRevisionEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenAdminEdit_WhenListingRevisions_ThenNewestFirstWithAuthorAndComment()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, "Статья с историей");

        await UpdateAsync(admin, created, "Статья с историей (правка)", "Второй текст", "Правка текста");

        var list = await admin.GetFromJsonAsync<List<ArticleRevisionSummaryDto>>($"/articles/{created.Id}/revisions", ApiJson.Options);
        list!.Select(r => r.Number).Should().Equal(2, 1);
        list[0].AuthorEmail.Should().Be(AdminEmail);
        list[0].Comment.Should().Be("Правка текста");
        var comparison = await admin.GetFromJsonAsync<ArticleRevisionComparisonDto>(
            $"/articles/{created.Id}/revisions/compare?from=1&to=2", ApiJson.Options);
        comparison!.From.Snapshot.Title.Should().Be("Статья с историей");
        comparison.To.Snapshot.Title.Should().Be("Статья с историей (правка)");
    }

    [Fact]
    public async Task GivenOldRevision_WhenRestoring_ThenContentIsBackAndANewRevisionIsAdded()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, "Откатываемая статья");
        await UpdateAsync(admin, created, "Испорченный заголовок", "Испорченный текст", null);

        var response = await admin.PostAsJsonAsync($"/articles/{created.Id}/revisions/1/restore", new { comment = (string?)null });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var restored = (await response.Content.ReadFromJsonAsync<ArticleRevisionSummaryDto>(ApiJson.Options))!;
        restored.Number.Should().Be(3);
        restored.Comment.Should().Be("Откат к ревизии 1");
        var content = await admin.GetFromJsonAsync<ArticleContentDto>($"/articles/{created.Id}/content", ApiJson.Options);
        content!.Title.Should().Be("Откатываемая статья");
        content.Paragraphs.Single().Opinions.Single().Content.Should().Be("Текст");
    }

    [Fact]
    public async Task GivenMissingRevision_WhenReading_ThenReturns404WithCode()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, "Статья без пятой ревизии");

        var response = await admin.GetAsync($"/articles/{created.Id}/revisions/5");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await response.Content.ReadAsStringAsync()).Should().Contain("revision_not_found");
    }

    [Fact]
    public async Task GivenAnonymousCaller_WhenReadingOrRestoringRevisions_ThenReturns401()
    {
        var anonymous = _factory.CreateClient();

        (await anonymous.GetAsync("/articles/1/revisions")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await anonymous.GetAsync("/articles/1/revisions/1")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await anonymous.GetAsync("/articles/1/revisions/compare?from=1&to=1")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await anonymous.PostAsJsonAsync("/articles/1/revisions/1/restore", new { }))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    private static async Task UpdateAsync(HttpClient admin, ArticleContentDto created, string title, string text, string? comment)
    {
        // InMemory provider: send opinions as new (id 0) so the full-replace update does not collide with tracked ones.
        var dto = created with
        {
            Title = title,
            Paragraphs = [new ParagraphDto { Id = created.Paragraphs[0].Id, Order = 1, Opinions = [new OpinionDto { Content = text, IsDefault = true }] }],
            EditComment = comment,
        };
        var response = await admin.PutAsJsonAsync($"/articles/{created.Id}/content", dto);
        response.StatusCode.Should().Be(HttpStatusCode.NoContent, await response.Content.ReadAsStringAsync());
    }

    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient admin, string title)
    {
        var dto = new ArticleContentCreateDto(
            title, null, [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
            null, null, null, null, null);
        var response = await admin.PostAsJsonAsync("/articles/content", dto);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
    }

    private async Task<HttpClient> CreateAdminClientAsync()
    {
        var client = _factory.CreateClient();
        var credentials = new { Email = AdminEmail, Password = "Test-password-1" };

        var register = await client.PostAsJsonAsync("/auth/register", credentials);
        var auth = register.IsSuccessStatusCode
            ? await register.Content.ReadFromJsonAsync<AdminAuthResponseDto>()
            : await (await client.PostAsJsonAsync("/auth/login", credentials)).Content.ReadFromJsonAsync<AdminAuthResponseDto>();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.AccessToken);
        return client;
    }
}
