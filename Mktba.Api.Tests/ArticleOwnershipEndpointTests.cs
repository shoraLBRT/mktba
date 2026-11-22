using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>
/// U-02 (#30): an author edits, reads the history of and submits only the articles they wrote or
/// co-author; an admin does all of it for any article. Someone else's draft answers 404, someone
/// else's Published article 403.
/// </summary>
public abstract class ArticleOwnershipEndpointTests
{
    private readonly MktbaApiFactory _factory;

    protected ArticleOwnershipEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenTheAuthorOfADraft_WhenReadingEditingAndUsingTheHistory_ThenEverythingSucceeds()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var created = await CreateArticleAsync(author, "Свой черновик");

        (await UpdateAsync(author, created, "Свой черновик (правка)")).Should().Be(HttpStatusCode.NoContent);

        (await author.GetAsync($"/articles/{created.Id}/content")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await author.GetAsync($"/articles/{created.Id}")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await author.GetAsync($"/articles/{created.Id}/revisions")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await author.GetAsync($"/articles/{created.Id}/revisions/1")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await author.GetAsync($"/articles/{created.Id}/revisions/compare?from=1&to=2")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await author.PostAsJsonAsync($"/articles/{created.Id}/revisions/1/restore", new { comment = (string?)null }))
            .StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GivenACoAuthor_WhenEditingTheArticle_ThenTheSaveSucceeds()
    {
        var (owner, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (coAuthor, coAuthorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var created = await CreateArticleAsync(owner, "Общая статья");
        var authors = await admin.GetFromJsonAsync<ArticleAuthorsDto>($"/articles/{created.Id}/authors", ApiJson.Options);
        (await admin.PutAsJsonAsync($"/articles/{created.Id}/authors", new ArticleAuthorsDto { AuthorId = authors!.AuthorId, CoAuthorIds = [coAuthorId] }))
            .EnsureSuccessStatusCode();

        (await UpdateAsync(coAuthor, created, "Общая статья (правка соавтора)")).Should().Be(HttpStatusCode.NoContent);
        (await coAuthor.GetAsync($"/articles/{created.Id}/revisions")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GivenAnotherAuthor_WhenTouchingSomeoneElsesDraft_ThenItLooksMissing()
    {
        var (owner, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (stranger, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var created = await CreateArticleAsync(owner, "Чужой черновик");

        (await UpdateAsync(stranger, created, "Взлом")).Should().Be(HttpStatusCode.NotFound);
        (await stranger.GetAsync($"/articles/{created.Id}/content")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await stranger.GetAsync($"/articles/{created.Id}/revisions")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        var submit = await stranger.PostAsJsonAsync($"/articles/{created.Id}/status", new { Status = "InReview" }, ApiJson.Options);
        submit.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await submit.Content.ReadAsStringAsync()).Should().Contain("article_not_found");
    }

    [Fact]
    public async Task GivenAnotherAuthor_WhenChangingSomeoneElsesPublishedArticle_ThenReturnsForbidden()
    {
        var (owner, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (stranger, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var created = await CreateArticleAsync(owner, "Чужая опубликованная");
        await ApiJson.PublishAsync(admin, created.Id);

        (await stranger.GetAsync($"/articles/{created.Id}/content")).StatusCode.Should().Be(HttpStatusCode.OK);
        var update = await stranger.PutAsJsonAsync($"/articles/{created.Id}/content", Edited(created, "Взлом"));
        update.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await update.Content.ReadAsStringAsync()).Should().Contain("\"forbidden\"");
        (await stranger.GetAsync($"/articles/{created.Id}/revisions")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await stranger.PostAsJsonAsync($"/articles/{created.Id}/revisions/1/restore", new { comment = (string?)null }))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await stranger.PostAsJsonAsync("/schools", new SchoolCreateDto("chuzhaya", "Чужая", "Ч", created.Id)))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task GivenAnAdmin_WhenEditingAnAuthorsArticle_ThenTheSaveSucceeds()
    {
        var (owner, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var created = await CreateArticleAsync(owner, "Статья автора");

        (await UpdateAsync(admin, created, "Статья автора (правка админа)")).Should().Be(HttpStatusCode.NoContent);
        (await admin.GetAsync($"/articles/{created.Id}/revisions")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GivenTheAuthor_WhenMovingTheStatus_ThenSubmitAndTakeBackWorkButReviewMovesAreForbidden()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var created = await CreateArticleAsync(author, "На проверку");

        var submitted = await ChangeStatusAsync(author, created.Id, "InReview");
        submitted.StatusCode.Should().Be(HttpStatusCode.OK);
        (await submitted.Content.ReadFromJsonAsync<ArticleReadDto>(ApiJson.Options))!.AllowedTransitions.Should().Equal(ArticleStatus.Draft);
        (await ChangeStatusAsync(author, created.Id, "Published")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await ChangeStatusAsync(author, created.Id, "Draft")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await ChangeStatusAsync(author, created.Id, "InReview")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await ChangeStatusAsync(admin, created.Id, "Published")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await ChangeStatusAsync(author, created.Id, "Archived")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task GivenTheAuthor_WhenChangingAuthorshipMovingOrDeleting_ThenReturnsForbidden()
    {
        var (author, authorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (_, otherId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var created = await CreateArticleAsync(author, "Своя, но не вся власть");

        (await author.PutAsJsonAsync($"/articles/{created.Id}/authors", new ArticleAuthorsDto { AuthorId = authorId, CoAuthorIds = [otherId] }))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await author.PostAsJsonAsync($"/articles/{created.Id}/move", new ArticleMoveDto { ParentArticleId = null, Index = 0 }))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await author.DeleteAsync($"/articles/{created.Id}")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await author.GetAsync($"/articles/{created.Id}/content")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GivenTheAuthor_WhenManagingCustomSchools_ThenOwnArticleWorksAndSomeoneElsesDraftLooksMissing()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (stranger, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var created = await CreateArticleAsync(author, "Статья со своей школой");
        var slug = $"school-{Guid.NewGuid():N}";

        var school = await author.PostAsJsonAsync("/schools", new SchoolCreateDto(slug, "Своя школа", "С", created.Id));
        school.StatusCode.Should().Be(HttpStatusCode.Created);
        var schoolId = (await school.Content.ReadFromJsonAsync<SchoolDto>(ApiJson.Options))!.Id;

        (await stranger.PostAsJsonAsync("/schools", new SchoolCreateDto($"{slug}-x", "Чужая", "Ч", created.Id)))
            .StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await stranger.DeleteAsync($"/schools/{schoolId}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await author.DeleteAsync($"/schools/{schoolId}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task GivenTheAuthor_WhenReadingTheTree_ThenOwnDraftIsListedAndEditable()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (stranger, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var created = await CreateArticleAsync(author, $"Черновик в дереве {Guid.NewGuid():N}");

        var forAuthor = await author.GetFromJsonAsync<List<NavigationArticleDto>>("/navigationTree/tree", ApiJson.Options);
        var forStranger = await stranger.GetFromJsonAsync<List<NavigationArticleDto>>("/navigationTree/tree", ApiJson.Options);

        forAuthor!.Should().ContainSingle(node => node.Id == created.Id).Which.CanEdit.Should().BeTrue();
        forStranger!.Should().NotContain(node => node.Id == created.Id);
    }

    private static Task<HttpResponseMessage> ChangeStatusAsync(HttpClient client, int articleId, string status) =>
        client.PostAsJsonAsync($"/articles/{articleId}/status", new { Status = status }, ApiJson.Options);

    private static async Task<HttpStatusCode> UpdateAsync(HttpClient client, ArticleContentDto created, string title)
    {
        var response = await client.PutAsJsonAsync($"/articles/{created.Id}/content", Edited(created, title));
        return response.StatusCode;
    }

    /// <summary>InMemory provider: opinions are sent as new (id 0) so the full-replace update does not collide with tracked ones.</summary>
    private static ArticleContentDto Edited(ArticleContentDto created, string title) => created with
    {
        Title = title,
        Paragraphs = [new ParagraphDto { Id = created.Paragraphs[0].Id, Order = 1, Opinions = [new OpinionDto { Content = title, IsDefault = true }] }],
    };

    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient client, string title)
    {
        var dto = new ArticleContentCreateDto(
            title, null, [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
            null, null, null, null, null);
        var response = await client.PostAsJsonAsync("/articles/content", dto);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
    }

    /// <summary>On the InMemory provider.</summary>
    public sealed class InMemory(MktbaApiFactory factory) : ArticleOwnershipEndpointTests(factory), IClassFixture<MktbaApiFactory>;

    /// <summary>On a real PostgreSQL database (X-07, #161).</summary>
    public sealed class OnPostgres(PostgresApiFactory factory) : ArticleOwnershipEndpointTests(factory), IClassFixture<PostgresApiFactory>;
}
