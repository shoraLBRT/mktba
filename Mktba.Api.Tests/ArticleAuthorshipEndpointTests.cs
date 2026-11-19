using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;

namespace Mktba.Api.Tests;

/// <summary>M-03 (#24): the author comes from the token, authorship is admin-only, readers see dates but no emails.</summary>
public sealed class ArticleAuthorshipEndpointTests : IClassFixture<MktbaApiFactory>
{
    private const string AdminEmail = "admin@mktba.test";

    private readonly MktbaApiFactory _factory;

    public ArticleAuthorshipEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenAdmin_WhenCreatingArticle_ThenTheAdminIsItsAuthor()
    {
        var admin = await CreateAdminClientAsync();
        var adminId = await AdminIdAsync(admin);

        var created = await CreateArticleAsync(admin, "Статья с автором");

        var meta = await admin.GetFromJsonAsync<ArticleReadDto>($"/articles/{created.Id}", ApiJson.Options);
        meta!.AuthorId.Should().Be(adminId);
        meta.CreatedAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromMinutes(1));
        meta.UpdatedAt.Should().Be(meta.CreatedAt);
        meta.PublishedAt.Should().BeNull();
        var authors = await admin.GetFromJsonAsync<ArticleAuthorsDto>($"/articles/{created.Id}/authors", ApiJson.Options);
        authors!.AuthorId.Should().Be(adminId);
        authors.CoAuthorIds.Should().BeEmpty();
    }

    [Fact]
    public async Task GivenAuthorListedAsCoAuthor_WhenSettingAuthors_ThenReturns400WithCode()
    {
        var admin = await CreateAdminClientAsync();
        var adminId = await AdminIdAsync(admin);
        var created = await CreateArticleAsync(admin, "Автор не соавтор");

        var response = await admin.PutAsJsonAsync($"/articles/{created.Id}/authors", new { authorId = adminId, coAuthorIds = new[] { adminId } });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await response.Content.ReadAsStringAsync()).Should().Contain("article_coauthor_is_author");
    }

    [Fact]
    public async Task GivenAnonymousCaller_WhenReadingOrChangingAuthorship_ThenReturns401()
    {
        var anonymous = _factory.CreateClient();

        (await anonymous.GetAsync("/users")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await anonymous.GetAsync("/articles/1/authors")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await anonymous.PutAsJsonAsync("/articles/1/authors", new { coAuthorIds = Array.Empty<int>() }))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GivenPublishedArticle_WhenAnonymousReadsContent_ThenSeesDatesButNoEmail()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, "Опубликованная с датой");
        await ApiJson.PublishAsync(admin, created.Id);

        var response = await _factory.CreateClient().GetAsync($"/articles/by-slug/{created.Slug}/content");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().NotContain(AdminEmail);
        var content = (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
        content.PublishedAt.Should().NotBeNull();
        content.UpdatedAt.Should().NotBeNull();
    }

    private static async Task<int> AdminIdAsync(HttpClient admin)
    {
        var users = await admin.GetFromJsonAsync<List<UserSummaryDto>>("/users", ApiJson.Options);
        return users!.Single(user => user.Email == AdminEmail).Id;
    }

    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient admin, string title)
    {
        var dto = new ArticleContentCreateDto(
            title, null, [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
            null, null, null, null, null);
        var response = await admin.PostAsJsonAsync("/articles/content", dto);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleContentDto>())!;
    }

    private async Task<HttpClient> CreateAdminClientAsync()
    {
        var client = _factory.CreateClient();
        var credentials = new { Email = AdminEmail, Password = "Test-password-1" };

        var register = await client.PostAsJsonAsync("/auth/register", credentials);
        var auth = register.IsSuccessStatusCode
            ? await register.Content.ReadFromJsonAsync<AdminAuthResponseDto>(ApiJson.Options)
            : await (await client.PostAsJsonAsync("/auth/login", credentials)).Content.ReadFromJsonAsync<AdminAuthResponseDto>(ApiJson.Options);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.AccessToken);
        return client;
    }
}
