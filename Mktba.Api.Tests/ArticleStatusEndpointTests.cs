using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>M-02 (#23): only Published articles reach anonymous readers; admins move articles between statuses.</summary>
public abstract class ArticleStatusEndpointTests
{
    private readonly MktbaApiFactory _factory;

    protected ArticleStatusEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenNewArticle_WhenAnonymousReads_ThenItIsDraftAndHidden()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, "Черновик для чтения");
        var anonymous = _factory.CreateClient();

        var meta = await admin.GetFromJsonAsync<ArticleReadDto>($"/articles/{created.Id}", ApiJson.Options);
        meta!.Status.Should().Be(ArticleStatus.Draft);

        (await anonymous.GetAsync($"/articles/by-slug/{created.Slug}/content")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await anonymous.GetAsync($"/articles/{created.Id}/content")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await anonymous.GetAsync($"/articles/{created.Id}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        var tree = await anonymous.GetFromJsonAsync<List<NavigationArticleDto>>("/navigationTree/tree", ApiJson.Options);
        Flatten(tree!).Should().NotContain(node => node.Id == created.Id);
    }

    [Fact]
    public async Task GivenDraft_WhenAdminReads_ThenSeesItWithStatusInTreeAndContent()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, "Черновик для админа");

        (await admin.GetAsync($"/articles/by-slug/{created.Slug}/content")).StatusCode.Should().Be(HttpStatusCode.OK);
        var tree = await admin.GetFromJsonAsync<List<NavigationArticleDto>>("/navigationTree/tree", ApiJson.Options);
        Flatten(tree!).Should().Contain(node => node.Id == created.Id && node.Status == ArticleStatus.Draft);
    }

    [Fact]
    public async Task GivenDraft_WhenPublishedThroughReview_ThenAnonymousSeesIt()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, "Статья к публикации");

        await ApiJson.PublishAsync(admin, created.Id);

        var anonymous = _factory.CreateClient();
        (await anonymous.GetAsync($"/articles/by-slug/{created.Slug}/content")).StatusCode.Should().Be(HttpStatusCode.OK);
        var tree = await anonymous.GetFromJsonAsync<List<NavigationArticleDto>>("/navigationTree/tree", ApiJson.Options);
        Flatten(tree!).Should().Contain(node => node.Id == created.Id && node.Status == ArticleStatus.Published);
    }

    [Fact]
    public async Task GivenDraft_WhenPublishingDirectly_ThenReturns400WithTransitionCode()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, "Без ревью");

        var response = await admin.PostAsJsonAsync($"/articles/{created.Id}/status", new { status = "Published" });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        problem.GetProperty("code").GetString().Should().Be("article_status_transition_invalid");
        problem.GetProperty("params").GetProperty("from").GetString().Should().Be("Draft");
        problem.GetProperty("params").GetProperty("to").GetString().Should().Be("Published");
    }

    [Fact]
    public async Task GivenAnonymousCaller_WhenChangingStatus_ThenReturns401()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, "Чужой статус");

        var response = await _factory.CreateClient().PostAsJsonAsync($"/articles/{created.Id}/status", new { status = "InReview" });

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GivenMissingArticle_WhenChangingStatus_ThenReturns404()
    {
        var admin = await CreateAdminClientAsync();

        var response = await admin.PostAsJsonAsync("/articles/987654/status", new { status = "InReview" });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    private static IEnumerable<NavigationArticleDto> Flatten(IEnumerable<NavigationArticleDto> nodes) =>
        nodes.SelectMany(node => new[] { node }.Concat(Flatten(node.Children ?? [])));

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
        var credentials = new { Email = "admin@mktba.test", Password = "Test-password-1" };

        var register = await client.PostAsJsonAsync("/auth/register", credentials);
        var auth = register.IsSuccessStatusCode
            ? await register.Content.ReadFromJsonAsync<AdminAuthResponseDto>(ApiJson.Options)
            : await (await client.PostAsJsonAsync("/auth/login", credentials)).Content.ReadFromJsonAsync<AdminAuthResponseDto>(ApiJson.Options);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.AccessToken);
        return client;
    }

    /// <summary>On the InMemory provider.</summary>
    public sealed class InMemory(MktbaApiFactory factory) : ArticleStatusEndpointTests(factory), IClassFixture<MktbaApiFactory>;

    /// <summary>On a real PostgreSQL database (X-07, #161).</summary>
    public sealed class OnPostgres(PostgresApiFactory factory) : ArticleStatusEndpointTests(factory), IClassFixture<PostgresApiFactory>;
}
