using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>
/// Regression tests for S-07 (#9): paragraph read endpoints exposed all content anonymously.
/// </summary>
public sealed class ParagraphEndpointsAuthorizationTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public ParagraphEndpointsAuthorizationTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenAnonymousClient_WhenListingParagraphs_ThenReturnsUnauthorized()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/paragraph");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GivenAnonymousClient_WhenGettingParagraphById_ThenReturnsUnauthorized()
    {
        var client = _factory.CreateClient();
        var (_, paragraphId) = await SeedArticleWithParagraphAsync();

        var response = await client.GetAsync($"/paragraph/{paragraphId}");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GivenInvalidToken_WhenListingParagraphs_ThenReturnsUnauthorized()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not-a-jwt");

        var response = await client.GetAsync("/paragraph");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GivenAdminToken_WhenListingParagraphs_ThenReturnsParagraphs()
    {
        var client = await CreateAdminClientAsync();
        await SeedArticleWithParagraphAsync();

        var paragraphs = await client.GetFromJsonAsync<List<ParagraphReadDto>>("/paragraph");

        paragraphs.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task GivenAdminToken_WhenGettingParagraphById_ThenReturnsThatParagraph()
    {
        var client = await CreateAdminClientAsync();
        var (_, paragraphId) = await SeedArticleWithParagraphAsync();

        var paragraph = await client.GetFromJsonAsync<ParagraphReadDto>($"/paragraph/{paragraphId}");

        paragraph!.Id.Should().Be(paragraphId);
    }

    [Fact]
    public async Task GivenAnonymousClient_WhenReadingPublishedArticleContent_ThenContentIsStillPublic()
    {
        var client = _factory.CreateClient();
        var (articleId, _) = await SeedArticleWithParagraphAsync();

        var response = await client.GetAsync($"/articles/{articleId}/content");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var content = await response.Content.ReadFromJsonAsync<ArticleContentDto>();
        content!.Paragraphs.Should().NotBeEmpty();
    }

    private async Task<(int ArticleId, int ParagraphId)> SeedArticleWithParagraphAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
        var paragraph = new Paragraph
        {
            Order = 1,
            Article = new Article { Title = "S-07 test article", Status = ArticleStatus.Published },
            Opinions = { new Opinion { Content = "Test opinion", IsDefault = true } },
        };
        dbContext.Paragraphs.Add(paragraph);
        await dbContext.SaveChangesAsync();
        return (paragraph.ArticleId, paragraph.Id);
    }

    private async Task<HttpClient> CreateAdminClientAsync()
    {
        var client = _factory.CreateClient();
        var credentials = new { Email = "admin@mktba.test", Password = "Test-password-1" };

        var register = await client.PostAsJsonAsync("/auth/register", credentials);
        var auth = register.IsSuccessStatusCode
            ? await register.Content.ReadFromJsonAsync<AdminAuthResponseDto>()
            : await (await client.PostAsJsonAsync("/auth/login", credentials)).Content.ReadFromJsonAsync<AdminAuthResponseDto>();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.AccessToken);
        return client;
    }
}
