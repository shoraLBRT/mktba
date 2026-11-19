using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Mktba.Application.DTOs;

namespace Mktba.Api.Tests;

/// <summary>M-09 (#27): articles have a locale, and slugs are looked up within one locale.</summary>
public sealed class ArticleLocaleEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public ArticleLocaleEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenSameSlugInRussianAndEnglish_WhenReadingBySlug_ThenLocaleParameterPicksTheArticle()
    {
        var admin = await CreateAdminClientAsync();
        var russian = await CreateArticleAsync(admin, NewArticle("Пост", "siyam"));
        var english = await CreateArticleAsync(admin, NewArticle("Fasting", "siyam", "en"));

        var client = _factory.CreateClient();
        var byDefault = await client.GetFromJsonAsync<ArticleContentDto>("/articles/by-slug/siyam/content");
        var byEnglish = await client.GetFromJsonAsync<ArticleContentDto>("/articles/by-slug/siyam/content?locale=en");

        byDefault!.Id.Should().Be(russian.Id);
        byDefault.Locale.Should().Be("ru");
        byEnglish!.Id.Should().Be(english.Id);
        byEnglish.Locale.Should().Be("en");
        byEnglish.TranslationGroupId!.Value.Should().NotBe(byDefault.TranslationGroupId!.Value);
    }

    [Fact]
    public async Task GivenRenamedEnglishSlug_WhenReadingOldSlugInEnglish_ThenRedirectKeepsTheLocale()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, NewArticle("Charity", "sadaqa-old", "en"));
        foreach (var opinion in created.Paragraphs.SelectMany(paragraph => paragraph.Opinions))
        {
            opinion.Id = 0;
        }

        var update = await admin.PutAsJsonAsync($"/articles/{created.Id}/content", created with { Slug = "sadaqa" });
        update.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var noRedirects = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var redirect = await noRedirects.GetAsync("/articles/by-slug/sadaqa-old/content?locale=en");
        var otherLocale = await noRedirects.GetAsync("/articles/by-slug/sadaqa-old/content");

        redirect.StatusCode.Should().Be(HttpStatusCode.Found);
        redirect.Headers.Location!.OriginalString.Should().Be("/articles/by-slug/sadaqa/content?locale=en");
        otherLocale.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GivenSlugTakenInSameLocale_WhenCreating_ThenReturns400WithSlugTakenCode()
    {
        var admin = await CreateAdminClientAsync();
        await CreateArticleAsync(admin, NewArticle("Pilgrimage", "hajj", "en"));

        var response = await admin.PostAsJsonAsync("/articles/content", NewArticle("Another pilgrimage", "hajj", "en"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        problem.GetProperty("code").GetString().Should().Be("article_slug_taken");
    }

    [Fact]
    public async Task GivenUnsupportedLocale_WhenCreating_ThenReturns400WithLocaleUnsupportedCode()
    {
        var admin = await CreateAdminClientAsync();

        var response = await admin.PostAsJsonAsync("/articles/content", NewArticle("Prière", null, "fr"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        problem.GetProperty("code").GetString().Should().Be("locale_unsupported");
        problem.GetProperty("params").GetProperty("locale").GetString().Should().Be("fr");
    }

    [Fact]
    public async Task GivenUnsupportedLocale_WhenReadingBySlug_ThenReturns400WithLocaleUnsupportedCode()
    {
        var response = await _factory.CreateClient().GetAsync("/articles/by-slug/anything/content?locale=fr");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        problem.GetProperty("code").GetString().Should().Be("locale_unsupported");
    }

    private static ArticleContentCreateDto NewArticle(string title, string? slug, string? locale = null) =>
        new(title, null, [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
            null, null, null, null, slug, Locale: locale);

    /// <summary>Creates an article and publishes it, so anonymous readers can reach it by slug.</summary>
    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient admin, ArticleContentCreateDto article)
    {
        var response = await admin.PostAsJsonAsync("/articles/content", article);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = (await response.Content.ReadFromJsonAsync<ArticleContentDto>())!;
        await ApiJson.PublishAsync(admin, created.Id);
        return created;
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
