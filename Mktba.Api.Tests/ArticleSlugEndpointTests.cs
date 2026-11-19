using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Mktba.Application.DTOs;

namespace Mktba.Api.Tests;

/// <summary>M-01 (#22): articles are read by slug over HTTP, and an old slug redirects to the current one.</summary>
public sealed class ArticleSlugEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public ArticleSlugEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenCreatedArticle_WhenReadingBySlug_ThenReturnsItsContentWithSlug()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, "Чтение по slug");

        var response = await _factory.CreateClient().GetAsync($"/articles/by-slug/{created.Slug}/content");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var content = await response.Content.ReadFromJsonAsync<ArticleContentDto>();
        content!.Id.Should().Be(created.Id);
        content.Slug.Should().Be("chtenie-po-slug");
    }

    [Fact]
    public async Task GivenRenamedSlug_WhenReadingByOldSlug_ThenRedirectsToCurrentSlug()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, "Старый адрес");
        var update = await admin.PutAsJsonAsync($"/articles/{created.Id}/content", AsNewOpinions(created) with { Slug = "novyy-adres" });
        update.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var noRedirects = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var redirect = await noRedirects.GetAsync("/articles/by-slug/staryy-adres/content");

        redirect.StatusCode.Should().Be(HttpStatusCode.Found);
        redirect.Headers.Location!.OriginalString.Should().Be("/articles/by-slug/novyy-adres/content");

        var followed = await _factory.CreateClient().GetFromJsonAsync<ArticleContentDto>("/articles/by-slug/staryy-adres/content");
        followed!.Id.Should().Be(created.Id);
        followed.Slug.Should().Be("novyy-adres");
    }

    [Fact]
    public async Task GivenUnknownSlug_WhenReading_ThenReturns404WithArticleNotFoundCode()
    {
        var response = await _factory.CreateClient().GetAsync("/articles/by-slug/no-such-article/content");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        problem.GetProperty("code").GetString().Should().Be("article_not_found");
    }

    [Fact]
    public async Task GivenInvalidSlug_WhenCreating_ThenReturns400WithSlugInvalidCode()
    {
        var admin = await CreateAdminClientAsync();

        var response = await admin.PostAsJsonAsync("/articles/content", NewArticle("Статья", "Не slug"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        problem.GetProperty("code").GetString().Should().Be("article_slug_invalid");
        problem.GetProperty("params").GetProperty("maxLength").GetInt32().Should().Be(80);
    }

    [Fact]
    public async Task GivenTakenSlug_WhenUpdating_ThenReturns400WithSlugTakenCode()
    {
        var admin = await CreateAdminClientAsync();
        var first = await CreateArticleAsync(admin, "Занятый адрес");
        var second = await CreateArticleAsync(admin, "Другая статья про адрес");

        var response = await admin.PutAsJsonAsync($"/articles/{second.Id}/content", second with { Slug = first.Slug });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        problem.GetProperty("code").GetString().Should().Be("article_slug_taken");
        problem.GetProperty("params").GetProperty("slug").GetString().Should().Be(first.Slug);
    }

    [Fact]
    public async Task GivenArticle_WhenReadingNavigationTree_ThenNodesCarrySlugs()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, "Узел дерева");

        var tree = await _factory.CreateClient().GetFromJsonAsync<List<NavigationArticleDto>>("/navigationTree/tree", ApiJson.Options);

        tree!.Should().Contain(node => node.Id == created.Id && node.Slug == "uzel-dereva");
    }

    [Fact]
    public async Task GivenDeletedPublishedArticle_WhenReadingBySlug_ThenReturns410WithArticleGoneCode()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, "Удалённая статья");
        (await admin.DeleteAsync($"/articles/{created.Id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var response = await _factory.CreateClient().GetAsync($"/articles/by-slug/{created.Slug}/content");

        response.StatusCode.Should().Be(HttpStatusCode.Gone);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("article_gone");
    }

    [Fact]
    public async Task GivenSlugOfDeletedArticleReusedByNewArticle_WhenReadingBySlug_ThenReturnsTheNewArticle()
    {
        var admin = await CreateAdminClientAsync();
        var deleted = await CreateArticleAsync(admin, "Повторный адрес");
        (await admin.DeleteAsync($"/articles/{deleted.Id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        var reused = await CreateArticleAsync(admin, "Повторный адрес");
        reused.Slug.Should().Be(deleted.Slug);

        var content = await _factory.CreateClient().GetFromJsonAsync<ArticleContentDto>($"/articles/by-slug/{deleted.Slug}/content");

        content!.Id.Should().Be(reused.Id);
    }

    [Fact]
    public async Task GivenArchivedArticle_WhenReadAnonymouslyBySlugOrId_ThenReturns410()
    {
        var admin = await CreateAdminClientAsync();
        var created = await CreateArticleAsync(admin, "Снятая статья");
        var archive = await admin.PostAsJsonAsync($"/articles/{created.Id}/status", new { status = "Archived" });
        archive.EnsureSuccessStatusCode();
        var anonymous = _factory.CreateClient();

        var bySlug = await anonymous.GetAsync($"/articles/by-slug/{created.Slug}/content");
        var byId = await anonymous.GetAsync($"/articles/{created.Id}/content");

        bySlug.StatusCode.Should().Be(HttpStatusCode.Gone);
        byId.StatusCode.Should().Be(HttpStatusCode.Gone);
        (await ApiJson.ReadCodeAsync(byId)).Should().Be("article_gone");
        (await admin.GetAsync($"/articles/{created.Id}/content")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    /// <summary>
    /// Sends the opinions as new (id 0): the InMemory provider cannot re-attach a replaced opinion
    /// under its old id, and these tests are about slugs.
    /// </summary>
    private static ArticleContentDto AsNewOpinions(ArticleContentDto article)
    {
        foreach (var opinion in article.Paragraphs.SelectMany(paragraph => paragraph.Opinions))
        {
            opinion.Id = 0;
        }

        return article;
    }

    private static ArticleContentCreateDto NewArticle(string title, string? slug = null) =>
        new(title, null, [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }], null, null, null, null, slug);

    /// <summary>Creates an article and publishes it, so anonymous readers can reach it by slug.</summary>
    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient admin, string title)
    {
        var response = await admin.PostAsJsonAsync("/articles/content", NewArticle(title));
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
