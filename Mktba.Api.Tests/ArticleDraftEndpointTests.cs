using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>E-02 (#75): the caller's own autosaved draft — read, written and deleted only by its user, dropped by «Сохранить».</summary>
public sealed class ArticleDraftEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public ArticleDraftEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenAuthorsArticle_WhenTheAuthorWritesAndReadsTheDraft_ThenItComesBackUntilDeleted()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var article = await CreateArticleAsync(author, "Статья с черновиком");

        var none = await author.GetAsync($"/articles/{article.Id}/draft");
        var put = await author.PutAsJsonAsync($"/articles/{article.Id}/draft", Draft("Правка в черновике", article.UpdatedAt));
        var read = await author.GetFromJsonAsync<ArticleDraftDto>($"/articles/{article.Id}/draft", ApiJson.Options);
        var delete = await author.DeleteAsync($"/articles/{article.Id}/draft");
        var afterDelete = await author.GetAsync($"/articles/{article.Id}/draft");

        none.StatusCode.Should().Be(HttpStatusCode.NoContent);
        put.StatusCode.Should().Be(HttpStatusCode.OK, await put.Content.ReadAsStringAsync());
        read!.Snapshot.GetProperty("title").GetString().Should().Be("Правка в черновике");
        read.BaseUpdatedAt.Should().Be(article.UpdatedAt);
        delete.StatusCode.Should().Be(HttpStatusCode.NoContent);
        afterDelete.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task GivenAnotherAuthorsDraftArticle_WhenAnAuthorAsksForItsDraft_ThenNotFound()
    {
        var (owner, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (stranger, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var article = await CreateArticleAsync(owner, "Чужая статья");
        await owner.PutAsJsonAsync($"/articles/{article.Id}/draft", Draft("Черновик владельца", article.UpdatedAt));

        var get = await stranger.GetAsync($"/articles/{article.Id}/draft");
        var put = await stranger.PutAsJsonAsync($"/articles/{article.Id}/draft", Draft("Чужая правка", article.UpdatedAt));

        get.StatusCode.Should().Be(HttpStatusCode.NotFound);
        put.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GivenAnAuthorsDraft_WhenAnAdminReadsTheArticlesDraft_ThenTheAdminGetsOnlyTheirOwn()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var article = await CreateArticleAsync(author, "Статья для рецензента");
        await author.PutAsJsonAsync($"/articles/{article.Id}/draft", Draft("Черновик автора", article.UpdatedAt));

        var get = await admin.GetAsync($"/articles/{article.Id}/draft");

        get.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task GivenADraft_WhenTheArticleIsSaved_ThenTheSaversDraftIsGone()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var article = await CreateArticleAsync(author, "Сохраняемая статья");
        await author.PutAsJsonAsync($"/articles/{article.Id}/draft", Draft("Несохранённое", article.UpdatedAt));

        var dto = article with
        {
            Title = "Сохраняемая статья (правка)",
            Paragraphs = [new ParagraphDto { Id = article.Paragraphs[0].Id, Order = 1, Opinions = [new OpinionDto { Content = "Новый текст", IsDefault = true }] }],
        };
        var save = await author.PutAsJsonAsync($"/articles/{article.Id}/content", dto);
        var get = await author.GetAsync($"/articles/{article.Id}/draft");

        save.StatusCode.Should().Be(HttpStatusCode.NoContent, await save.Content.ReadAsStringAsync());
        get.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task GivenNewArticleDraft_WhenTheArticleIsCreated_ThenTheDraftIsGone()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);

        var put = await author.PutAsJsonAsync("/articles/draft", Draft("Новая статья", null));
        var read = await author.GetFromJsonAsync<ArticleDraftDto>("/articles/draft", ApiJson.Options);
        await CreateArticleAsync(author, "Новая статья");
        var afterCreate = await author.GetAsync("/articles/draft");

        put.StatusCode.Should().Be(HttpStatusCode.OK);
        read!.Snapshot.GetProperty("title").GetString().Should().Be("Новая статья");
        afterCreate.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task GivenSnapshotThatIsNotAnObject_WhenWritten_ThenBadRequestWithItsCode()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);

        var put = await author.PutAsJsonAsync("/articles/draft", new { snapshot = new[] { 1, 2 }, baseUpdatedAt = (DateTime?)null });

        put.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await put.Content.ReadAsStringAsync()).Should().Contain("article_draft_snapshot_invalid");
    }

    [Fact]
    public async Task GivenReader_WhenWritingADraft_ThenForbidden()
    {
        var (reader, _) = await RoleClients.CreateAsync(_factory, UserRole.Reader);

        var put = await reader.PutAsJsonAsync("/articles/draft", Draft("Читатель", null));

        put.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    private static object Draft(string title, DateTime? baseUpdatedAt) =>
        new { snapshot = new { title, blocks = Array.Empty<object>() }, baseUpdatedAt };

    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient client, string title)
    {
        var dto = new ArticleContentCreateDto(
            title, null, [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
            null, null, null, null, null);
        var response = await client.PostAsJsonAsync("/articles/content", dto);
        response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
    }
}
