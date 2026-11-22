using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>
/// X-07 (#161): publication as an anonymous reader sees it through <c>GET /search</c>, which needs
/// PostgreSQL (full-text search, R-10 #46): only a Published article whose every ancestor is Published
/// is found, and it leaves the results when it is archived. The InMemory API tests cannot run the search.
/// </summary>
public sealed class PublicationSearchEndpointTests : IClassFixture<PostgresApiFactory>
{
    private readonly PostgresApiFactory _factory;

    public PublicationSearchEndpointTests(PostgresApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenAnAuthorsArticle_WhenItGoesThroughReviewToPublishedAndArchived_ThenOnlyThePublishedOneIsFound()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var word = UniqueWord();
        var article = await CreateArticleAsync(author, $"Статья {word}", parentId: null);
        var anonymous = _factory.CreateClient();

        (await SearchAsync(anonymous, word)).Should().NotContain(article.Id, "a draft is not public");

        (await ChangeStatusAsync(author, article.Id, "InReview")).Should().Be(HttpStatusCode.OK);
        (await SearchAsync(anonymous, word)).Should().NotContain(article.Id, "an article in review is not public");
        (await SearchAsync(author, word)).Should().NotContain(article.Id, "the search is the same for every caller");

        (await ChangeStatusAsync(author, article.Id, "Published")).Should().Be(HttpStatusCode.Forbidden);
        (await ChangeStatusAsync(admin, article.Id, "Published")).Should().Be(HttpStatusCode.OK);
        (await SearchAsync(anonymous, word)).Should().Equal(article.Id);
        (await anonymous.GetAsync($"/articles/by-slug/{article.Slug}/content")).StatusCode.Should().Be(HttpStatusCode.OK);

        (await ChangeStatusAsync(admin, article.Id, "Archived")).Should().Be(HttpStatusCode.OK);
        (await SearchAsync(anonymous, word)).Should().NotContain(article.Id, "an archived article is not public");
        var gone = await anonymous.GetAsync($"/articles/by-slug/{article.Slug}/content");
        gone.StatusCode.Should().Be(HttpStatusCode.Gone, "an article archived after publication is gone, not missing");
        (await ApiJson.ReadCodeAsync(gone)).Should().Be("article_gone");
    }

    [Fact]
    public async Task GivenAPublishedChildOfADraft_WhenSearched_ThenItIsFoundOnlyOnceTheParentIsPublished()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var word = UniqueWord();
        var parent = await CreateArticleAsync(admin, "Раздел-черновик", parentId: null);
        var child = await CreateArticleAsync(admin, $"Вложенная {word}", parent.Id);
        await ApiJson.PublishAsync(admin, child.Id);
        var anonymous = _factory.CreateClient();

        (await SearchAsync(anonymous, word)).Should().NotContain(child.Id, "its parent is still a draft");

        await ApiJson.PublishAsync(admin, parent.Id);
        (await SearchAsync(anonymous, word)).Should().Equal(child.Id);
    }

    [Fact]
    public async Task GivenAnotherAuthorsDraft_WhenAStrangerEditsIt_ThenNothingIsSavedInTheDatabase()
    {
        var (owner, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (stranger, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var word = UniqueWord();
        var article = await CreateArticleAsync(owner, "Чужой черновик", parentId: null);

        var edit = await stranger.PutAsJsonAsync($"/articles/{article.Id}/content", article with { Title = $"Взлом {word}" });
        edit.StatusCode.Should().Be(HttpStatusCode.NotFound);

        await ApiJson.PublishAsync(admin, article.Id);
        (await SearchAsync(_factory.CreateClient(), word)).Should().BeEmpty();
        var stored = await admin.GetFromJsonAsync<ArticleContentDto>($"/articles/{article.Id}/content", ApiJson.Options);
        stored!.Title.Should().Be("Чужой черновик");
    }

    /// <summary>A word no other test's article has: one Latin word, stemmed alike in the query and the index.</summary>
    private static string UniqueWord() => "x" + string.Concat(Guid.NewGuid().ToString("N").Select(c => (char)('a' + c % 26)));

    private static async Task<List<int>> SearchAsync(HttpClient client, string query)
    {
        var results = await client.GetFromJsonAsync<SearchResultsDto>($"/search?q={Uri.EscapeDataString(query)}", ApiJson.Options);
        return results!.Items.Select(item => item.Id).ToList();
    }

    private static async Task<HttpStatusCode> ChangeStatusAsync(HttpClient client, int articleId, string status)
    {
        var response = await client.PostAsJsonAsync($"/articles/{articleId}/status", new { Status = status }, ApiJson.Options);
        return response.StatusCode;
    }

    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient client, string title, int? parentId)
    {
        var dto = new ArticleContentCreateDto(
            title, parentId, [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст статьи", true, [])] }],
            null, null, null, null, null);
        var response = await client.PostAsJsonAsync("/articles/content", dto);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
    }
}
