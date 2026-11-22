using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>
/// #194: <c>GET /schools/article/{id}</c> follows the visibility rule of the other article reads, so the
/// custom schools of a non-Published article do not leak to anonymous callers or to other authors,
/// while the article's own author and admins still get them in the editor.
/// </summary>
public sealed class ArticleSchoolsReadEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public ArticleSchoolsReadEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    private static async Task<int> CreateArticleWithSchoolAsync(HttpClient client, string title, string schoolName)
    {
        var created = await client.PostAsJsonAsync("/articles", new ArticleCreateDto { Title = title });
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var article = (await created.Content.ReadFromJsonAsync<ArticleReadDto>(ApiJson.Options))!;

        var school = await client.PostAsJsonAsync(
            "/schools",
            new SchoolCreateDto($"custom-{Guid.NewGuid():N}", schoolName, "Кс", article.Id));
        school.StatusCode.Should().Be(HttpStatusCode.Created);
        return article.Id;
    }

    private static async Task AssertNotFoundAsync(HttpResponseMessage response)
    {
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        problem.GetProperty("code").GetString().Should().Be("article_not_found");
    }

    private static async Task<List<SchoolDto>> ReadSchoolsAsync(HttpClient client, int articleId)
    {
        var response = await client.GetAsync($"/schools/article/{articleId}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<List<SchoolDto>>(ApiJson.Options))!;
    }

    [Fact]
    public async Task GivenADraftWithACustomSchool_WhenSomeoneWhoMayNotSeeItReadsItsSchools_ThenAnswers404()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (otherAuthor, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var draftId = await CreateArticleWithSchoolAsync(author, "Черновик со своей школой", "Секретная школа");

        await AssertNotFoundAsync(await _factory.CreateClient().GetAsync($"/schools/article/{draftId}"));
        await AssertNotFoundAsync(await otherAuthor.GetAsync($"/schools/article/{draftId}"));
    }

    [Fact]
    public async Task GivenADraftWithACustomSchool_WhenItsAuthorOrAnAdminReadsItsSchools_ThenGetsThem()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var draftId = await CreateArticleWithSchoolAsync(author, "Черновик для редактора", "Школа автора");

        (await ReadSchoolsAsync(author, draftId)).Select(school => school.Name).Should().Equal("Школа автора");
        (await ReadSchoolsAsync(admin, draftId)).Select(school => school.Name).Should().Equal("Школа автора");
    }

    [Fact]
    public async Task GivenAnArticleInReview_WhenAnAnonymousCallerReadsItsSchools_ThenAnswers404()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var articleId = await CreateArticleWithSchoolAsync(author, "Статья на ревью со школой", "Школа на ревью");
        (await author.PostAsJsonAsync($"/articles/{articleId}/status", new { status = "InReview" })).EnsureSuccessStatusCode();

        await AssertNotFoundAsync(await _factory.CreateClient().GetAsync($"/schools/article/{articleId}"));
    }

    [Fact]
    public async Task GivenAPublishedArticleWithACustomSchool_WhenAnAnonymousCallerReadsItsSchools_ThenGetsThem()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var articleId = await CreateArticleWithSchoolAsync(admin, "Опубликованная со школой", "Открытая школа");
        await ApiJson.PublishAsync(admin, articleId);

        (await ReadSchoolsAsync(_factory.CreateClient(), articleId)).Select(school => school.Name).Should().Equal("Открытая школа");
    }

    [Fact]
    public async Task GivenNoSuchArticle_WhenReadingItsSchools_ThenAnswers404()
    {
        await AssertNotFoundAsync(await _factory.CreateClient().GetAsync($"/schools/article/{int.MaxValue}"));
    }
}
