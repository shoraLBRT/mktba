using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>
/// Regression tests for S-14 (#16): school links on a plain (single-opinion) paragraph were silently
/// dropped on save. A plain paragraph is common to all schools, so the API now rejects school ids on
/// it with <c>paragraph_plain_schools_not_allowed</c> instead of pretending to save them.
/// </summary>
public sealed class PlainParagraphSchoolsTests : IClassFixture<MktbaApiFactory>
{
    private const string PlainSchoolsCode = "paragraph_plain_schools_not_allowed";

    private readonly MktbaApiFactory _factory;

    public PlainParagraphSchoolsTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenPlainParagraphWithSchools_WhenCreatingIt_ThenReturns400AndStoresNothing()
    {
        var client = await CreateAdminClientAsync();
        var (articleId, _, schoolIds) = await SeedArticleWithVersionedParagraphAsync();

        var response = await client.PostAsJsonAsync("/paragraph", new ParagraphCreateDto
        {
            ArticleId = articleId,
            Order = 2,
            Opinions = { new OpinionCreateDto("Plain text", true, new List<int> { schoolIds[0] }) },
        });

        await AssertProblemCodeAsync(response, PlainSchoolsCode);
        (await CountParagraphsAsync(articleId)).Should().Be(1);
    }

    [Fact]
    public async Task GivenVersionedParagraphWithSchools_WhenCreatingIt_ThenStoresTheSchoolLinks()
    {
        var client = await CreateAdminClientAsync();
        var (articleId, _, schoolIds) = await SeedArticleWithVersionedParagraphAsync();

        var response = await client.PostAsJsonAsync("/paragraph", new ParagraphCreateDto
        {
            ArticleId = articleId,
            Order = 2,
            Opinions =
            {
                new OpinionCreateDto("Default", true, new List<int>()),
                new OpinionCreateDto("Specific", false, new List<int> { schoolIds[1] }),
            },
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await response.Content.ReadFromJsonAsync<ParagraphReadDto>();
        created!.Opinions.Single(o => !o.IsDefault).SchoolIds.Should().Equal(schoolIds[1]);
    }

    [Fact]
    public async Task GivenPlainParagraphWithSchools_WhenUpdatingTheParagraph_ThenReturns400AndKeepsStoredLinks()
    {
        var client = await CreateAdminClientAsync();
        var (_, paragraphId, schoolIds) = await SeedArticleWithVersionedParagraphAsync();

        var response = await client.PutAsJsonAsync($"/paragraph/{paragraphId}", new ParagraphUpdateDto
        {
            Order = 1,
            Opinions = { new OpinionUpdateDto(0, "Now plain", true, new List<int> { schoolIds[0] }) },
        });

        await AssertProblemCodeAsync(response, PlainSchoolsCode);
        (await GetStoredSchoolIdsAsync(paragraphId)).Should().BeEquivalentTo(schoolIds);
    }

    [Fact]
    public async Task GivenPlainParagraphWithSchools_WhenSavingArticleContent_ThenReturns400AndKeepsStoredLinks()
    {
        var client = await CreateAdminClientAsync();
        var (articleId, paragraphId, schoolIds) = await SeedArticleWithVersionedParagraphAsync();

        var content = await client.GetFromJsonAsync<ArticleContentDto>($"/articles/{articleId}/content");
        var plain = content! with
        {
            Paragraphs = new List<ParagraphDto>
            {
                new()
                {
                    Id = paragraphId,
                    Order = 1,
                    Opinions = { new OpinionDto { Content = "Now plain", IsDefault = true, SchoolIds = { schoolIds[0] } } },
                },
            },
        };

        var response = await client.PutAsJsonAsync($"/articles/{articleId}/content", plain);

        await AssertProblemCodeAsync(response, PlainSchoolsCode);
        (await GetStoredSchoolIdsAsync(paragraphId)).Should().BeEquivalentTo(schoolIds);
    }

    [Fact]
    public async Task GivenNewArticleWithPlainParagraphWithSchools_WhenCreatingIt_ThenReturns400()
    {
        var client = await CreateAdminClientAsync();
        var (_, _, schoolIds) = await SeedArticleWithVersionedParagraphAsync();

        var response = await client.PostAsJsonAsync("/articles/content", new
        {
            Title = "S-14 new article",
            Paragraphs = new[]
            {
                new { ArticleId = 0, Order = 1, Opinions = new[] { new { Content = "Plain", IsDefault = true, SchoolIds = new[] { schoolIds[0] } } } },
            },
        });

        await AssertProblemCodeAsync(response, PlainSchoolsCode);
    }

    private static async Task AssertProblemCodeAsync(HttpResponseMessage response, string expectedCode)
    {
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        problem.GetProperty("code").GetString().Should().Be(expectedCode);
    }

    /// <summary>Seeds an article whose only paragraph is versioned: a default opinion and one linked to two system schools.</summary>
    private async Task<(int ArticleId, int ParagraphId, List<int> SchoolIds)> SeedArticleWithVersionedParagraphAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
        var schoolIds = await dbContext.Schools.Where(s => s.IsSystem).OrderBy(s => s.Id).Select(s => s.Id).Take(2).ToListAsync();
        schoolIds.Should().HaveCount(2, "the API seeds the system schools on startup");

        var specific = new Opinion { Content = "Specific", IsDefault = false };
        foreach (var schoolId in schoolIds)
        {
            specific.OpinionSchools.Add(new OpinionSchool { SchoolId = schoolId });
        }

        var paragraph = new Paragraph
        {
            Order = 1,
            Article = new Article { Title = "S-14 test article" },
            Opinions = { new Opinion { Content = "Default", IsDefault = true }, specific },
        };
        dbContext.Paragraphs.Add(paragraph);
        await dbContext.SaveChangesAsync();
        return (paragraph.ArticleId, paragraph.Id, schoolIds);
    }

    private async Task<List<int>> GetStoredSchoolIdsAsync(int paragraphId)
    {
        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
        return await dbContext.Set<OpinionSchool>()
            .Where(os => os.Opinion.ParagraphId == paragraphId)
            .Select(os => os.SchoolId)
            .ToListAsync();
    }

    private async Task<int> CountParagraphsAsync(int articleId)
    {
        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
        return await dbContext.Paragraphs.CountAsync(p => p.ArticleId == articleId);
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
