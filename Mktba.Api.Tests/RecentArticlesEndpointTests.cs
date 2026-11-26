using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>R-05 (#41): <c>GET /articles/recent</c> lists new and updated articles, to anyone.</summary>
public sealed class RecentArticlesEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public RecentArticlesEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenPublishedEditedAndDraftArticles_WhenAnonymousReadsRecent_ThenOnlyPublishedAreListedAndTheEditedOneIsUpdated()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var published = await CreateArticleAsync(admin, "Лента опубликованная");
        await ApiJson.PublishAsync(admin, published.Id);
        var edited = await CreateArticleAsync(admin, "Лента правленая");
        await ApiJson.PublishAsync(admin, edited.Id);
        var update = await admin.PutAsJsonAsync($"/articles/{edited.Id}/content", Edited(edited, "Лента правленая после публикации"));
        update.StatusCode.Should().Be(HttpStatusCode.NoContent);
        var draft = await CreateArticleAsync(admin, "Лента черновик");

        var response = await _factory.CreateClient().GetAsync("/articles/recent");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var recent = (await response.Content.ReadFromJsonAsync<RecentArticlesDto>(ApiJson.Options))!;
        recent.New.Select(article => article.Id).Should().Contain([published.Id, edited.Id]).And.NotContain(draft.Id);
        recent.Updated.Select(article => article.Id).Should().Contain(edited.Id).And.NotContain([published.Id, draft.Id]);
        recent.Updated.Single(article => article.Id == edited.Id).Title.Should().Be("Лента правленая после публикации");
    }

    [Fact]
    public async Task GivenUnsupportedLocale_WhenReadingRecent_ThenReturns400WithLocaleUnsupportedCode()
    {
        var response = await _factory.CreateClient().GetAsync("/articles/recent?locale=fr");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("locale_unsupported");
    }

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
}
