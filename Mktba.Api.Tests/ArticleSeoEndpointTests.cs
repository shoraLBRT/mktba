using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Mktba.Application.DTOs;

namespace Mktba.Api.Tests;

/// <summary>M-10 (#28): SEO fields are saved through the content endpoints and readers get the effective metadata.</summary>
public sealed class ArticleSeoEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public ArticleSeoEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenPublishedArticleWithSeo_WhenAnonymousReadsBySlug_ThenGetsOverridesAndMeta()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, "SEO статья", new ArticleSeoDto("Свой заголовок", "Своё описание", "https://cdn.example.com/a.png", true));
        await ApiJson.PublishAsync(admin, created.Id);

        var content = await _factory.CreateClient().GetFromJsonAsync<ArticleContentDto>($"/articles/by-slug/{created.Slug}/content");

        content!.Seo.Should().Be(new ArticleSeoDto("Свой заголовок", "Своё описание", "https://cdn.example.com/a.png", true));
        content.Meta.Should().Be(new ArticleMetaDto("Свой заголовок", "Своё описание", "https://cdn.example.com/a.png", true));
    }

    [Fact]
    public async Task GivenArticleWithoutSeo_WhenRead_ThenMetaFallsBackToTitleAndText()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, "Без SEO", seo: null);
        await ApiJson.PublishAsync(admin, created.Id);

        var content = await admin.GetFromJsonAsync<ArticleContentDto>($"/articles/{created.Id}/content");

        content!.Seo.Should().Be(new ArticleSeoDto(null, null, null, false));
        content.Meta.Should().Be(new ArticleMetaDto("Без SEO", "Текст", null, false));
    }

    [Fact]
    public async Task GivenInvalidSocialImageUrl_WhenUpdating_ThenReturns400WithCode()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, "Плохая картинка", seo: null);

        var response = await admin.PutAsJsonAsync($"/articles/{created.Id}/content",
            AsNewOpinions(created) with { Seo = new ArticleSeoDto(null, null, "javascript:alert(1)", false) });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        problem.GetProperty("code").GetString().Should().Be("article_social_image_url_invalid");
    }

    [Fact]
    public async Task GivenTooLongSeoTitle_WhenCreating_ThenReturns400WithCodeAndMaxLength()
    {
        var admin = await CreateAdminClientAsync();

        var response = await admin.PostAsJsonAsync("/articles/content", NewArticle("Длинный SEO", new ArticleSeoDto(new string('а', 71), null, null, false)));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        problem.GetProperty("code").GetString().Should().Be("article_seo_title_too_long");
        problem.GetProperty("params").GetProperty("maxLength").GetInt32().Should().Be(70);
    }

    [Fact]
    public async Task GivenUpdatedSeo_WhenSaved_ThenLaterReadReturnsIt()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, "Правка SEO", seo: null);

        var response = await admin.PutAsJsonAsync($"/articles/{created.Id}/content",
            AsNewOpinions(created) with { Seo = new ArticleSeoDto("Новый", null, "/img/a.png", false) });

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        var content = await admin.GetFromJsonAsync<ArticleContentDto>($"/articles/{created.Id}/content");
        content!.Seo.Should().Be(new ArticleSeoDto("Новый", null, "/img/a.png", false));
        content.Meta!.Title.Should().Be("Новый");
    }

    /// <summary>Sends the opinions as new (id 0): the InMemory provider cannot re-attach a replaced opinion under its old id.</summary>
    private static ArticleContentDto AsNewOpinions(ArticleContentDto article)
    {
        foreach (var opinion in article.Paragraphs.SelectMany(paragraph => paragraph.Opinions))
        {
            opinion.Id = 0;
        }

        return article;
    }

    private static ArticleContentCreateDto NewArticle(string title, ArticleSeoDto? seo) =>
        new(title, null, [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }], null, null, null, null, Seo: seo);

    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient admin, string title, ArticleSeoDto? seo)
    {
        var response = await admin.PostAsJsonAsync("/articles/content", NewArticle(title, seo));
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
