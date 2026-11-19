using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>
/// Regression tests for S-13 (#15): errors came back as English text in <c>{ message }</c>;
/// every error must now be a problem body with a stable code the UI translates.
/// </summary>
public sealed class ErrorResponseTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public ErrorResponseTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenMissingArticle_WhenReadingItsContent_ThenReturns404WithArticleNotFoundCode()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/articles/987654/content");

        var problem = await ReadProblemAsync(response, HttpStatusCode.NotFound);
        problem.GetProperty("code").GetString().Should().Be("article_not_found");
        problem.GetProperty("status").GetInt32().Should().Be(404);
        problem.GetProperty("traceId").GetString().Should().NotBeNullOrEmpty();
        problem.TryGetProperty("params", out _).Should().BeFalse();
    }

    [Fact]
    public async Task GivenMissingArticle_WhenReadingIt_ThenReturns404ProblemInsteadOfEmptyBody()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/articles/987654");

        var problem = await ReadProblemAsync(response, HttpStatusCode.NotFound);
        problem.GetProperty("code").GetString().Should().Be("article_not_found");
    }

    [Fact]
    public async Task GivenWrongCredentials_WhenLoggingIn_ThenReturns400WithInvalidCredentialsCode()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/auth/login", new { Email = "nobody@mktba.test", Password = "Wrong-password-1" });

        var problem = await ReadProblemAsync(response, HttpStatusCode.BadRequest);
        problem.GetProperty("code").GetString().Should().Be("invalid_credentials");
        problem.TryGetProperty("message", out _).Should().BeFalse();
    }

    [Fact]
    public async Task GivenArticleWithoutTitle_WhenCreating_ThenReturns400WithValidationCode()
    {
        var client = await CreateAdminClientAsync();

        var response = await client.PostAsJsonAsync("/articles/content", new
        {
            Title = " ",
            Paragraphs = Array.Empty<object>(),
        });

        var problem = await ReadProblemAsync(response, HttpStatusCode.BadRequest);
        problem.GetProperty("code").GetString().Should().Be("article_title_required");
    }

    [Fact]
    public async Task GivenParagraphOrderBeyondTheEnd_WhenCreating_ThenReturnsCodeWithParams()
    {
        var client = await CreateAdminClientAsync();
        var articleId = await SeedArticleWithOneParagraphAsync();

        var response = await client.PostAsJsonAsync("/paragraph", new ParagraphCreateDto
        {
            ArticleId = articleId,
            Order = 9,
            Opinions = { new OpinionCreateDto("Opinion", true, new List<int>()) },
        });

        var problem = await ReadProblemAsync(response, HttpStatusCode.BadRequest);
        problem.GetProperty("code").GetString().Should().Be("paragraph_order_too_large");
        problem.GetProperty("params").GetProperty("maxOrder").GetInt32().Should().Be(2);
    }

    [Fact]
    public async Task GivenMalformedJsonBody_WhenLoggingIn_ThenReturns400WithBadRequestCode()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsync("/auth/login", new StringContent("{not json", Encoding.UTF8, "application/json"));

        var problem = await ReadProblemAsync(response, HttpStatusCode.BadRequest);
        problem.GetProperty("code").GetString().Should().Be("bad_request");
    }

    [Fact]
    public async Task GivenAnonymousClient_WhenCallingAdminEndpoint_ThenReturns401WithUnauthorizedCode()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsync("/admin/cleanup", content: null);

        var problem = await ReadProblemAsync(response, HttpStatusCode.Unauthorized);
        problem.GetProperty("code").GetString().Should().Be("unauthorized");
    }

    private static async Task<JsonElement> ReadProblemAsync(HttpResponseMessage response, HttpStatusCode expectedStatus)
    {
        response.StatusCode.Should().Be(expectedStatus);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private async Task<int> SeedArticleWithOneParagraphAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
        var paragraph = new Paragraph
        {
            Order = 1,
            Article = new Article { Title = "S-13 test article" },
            Opinions = { new Opinion { Content = "Test opinion", IsDefault = true } },
        };
        dbContext.Paragraphs.Add(paragraph);
        await dbContext.SaveChangesAsync();
        return paragraph.ArticleId;
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
