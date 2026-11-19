using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;

namespace Mktba.Api.Tests;

/// <summary>O-06 (#57): <c>GET /articles/sitemap</c> lists what search engines may index, to anyone.</summary>
public sealed class SitemapEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public SitemapEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenPublishedDraftNoIndexAndHiddenChild_WhenAnonymousReadsSitemap_ThenOnlyThePublishedIndexableArticleIsListed()
    {
        var admin = await CreateAdminClientAsync();
        var published = await CreateArticleAsync(admin, "Карта опубликованная", parentId: null, noIndex: false);
        await ApiJson.PublishAsync(admin, published.Id);
        var draft = await CreateArticleAsync(admin, "Карта черновик", parentId: null, noIndex: false);
        var hiddenChild = await CreateArticleAsync(admin, "Карта под черновиком", parentId: draft.Id, noIndex: false);
        await ApiJson.PublishAsync(admin, hiddenChild.Id);
        var noIndex = await CreateArticleAsync(admin, "Карта noindex", parentId: null, noIndex: true);
        await ApiJson.PublishAsync(admin, noIndex.Id);

        var response = await _factory.CreateClient().GetAsync("/articles/sitemap");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var slugs = (await response.Content.ReadFromJsonAsync<List<SitemapArticleDto>>())!.Select(article => article.Slug).ToList();
        slugs.Should().Contain(published.Slug);
        slugs.Should().NotContain([draft.Slug, hiddenChild.Slug, noIndex.Slug]);
    }

    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient admin, string title, int? parentId, bool noIndex)
    {
        var request = new ArticleContentCreateDto(
            title,
            parentId,
            [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
            null, null, null, null,
            Seo: new ArticleSeoDto(null, null, null, noIndex));
        var response = await admin.PostAsJsonAsync("/articles/content", request);
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
}
