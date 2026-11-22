using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Application.Services.Analytics;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>N-09 (#103): <c>GET /analytics/articles/{id}</c> — one article's statistics, for an admin and the article's own authors only.</summary>
public sealed class ArticleAnalyticsEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public ArticleAnalyticsEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenTheAuthor_WhenAskingWithoutDays_ThenGetsTheArticlesLastThirtyDays()
    {
        var (author, authorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var articleId = await SeedArticleAsync(authorId, ArticleStatus.Published, views: 5, schoolViews: 2);

        var result = await author.GetFromJsonAsync<ArticleAnalyticsDto>($"/analytics/articles/{articleId}", ApiJson.Options);

        result!.ArticleId.Should().Be(articleId);
        result.Days.Should().Be(ArticleAnalyticsService.DefaultDays);
        result.Daily.Should().HaveCount(ArticleAnalyticsService.DefaultDays);
        result.To.Should().Be(DateOnly.FromDateTime(DateTime.UtcNow));
        result.Totals.Should().Be(new ArticleAnalyticsTotalsDto(5, 5, 3, 2, 1));
        result.Depth.Should().Be(new ReadDepthDto(5, 5, 0, 0, 0));
        result.Schools.Sum(s => s.Views).Should().Be(2);
        result.ViewsWithoutSchool.Should().Be(3);
    }

    [Fact]
    public async Task GivenACoAuthor_WhenAsking_ThenGetsTheArticlesNumbers()
    {
        var (_, authorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (coAuthor, coAuthorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var articleId = await SeedArticleAsync(authorId, ArticleStatus.Draft, views: 4, schoolViews: 0, coAuthorId);

        var result = await coAuthor.GetFromJsonAsync<ArticleAnalyticsDto>($"/analytics/articles/{articleId}?days=7", ApiJson.Options);

        result!.Daily.Should().HaveCount(7);
        result.Totals.Views.Should().Be(4);
    }

    [Fact]
    public async Task GivenAnAdmin_WhenAskingAboutAnyArticle_ThenGetsItsNumbers()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (_, authorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var articleId = await SeedArticleAsync(authorId, ArticleStatus.Draft, views: 7, schoolViews: 0);

        var result = await admin.GetFromJsonAsync<ArticleAnalyticsDto>($"/analytics/articles/{articleId}", ApiJson.Options);

        result!.Totals.Views.Should().Be(7);
    }

    [Fact]
    public async Task GivenAnotherAuthor_WhenAskingAboutAPublishedArticle_ThenIsForbidden()
    {
        var (_, authorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (other, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var articleId = await SeedArticleAsync(authorId, ArticleStatus.Published, views: 9, schoolViews: 0);

        var response = await other.GetAsync($"/analytics/articles/{articleId}");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task GivenAnotherAuthor_WhenAskingAboutADraft_ThenItIsNotFound()
    {
        var (_, authorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (other, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var articleId = await SeedArticleAsync(authorId, ArticleStatus.Draft, views: 9, schoolViews: 0);

        var response = await other.GetAsync($"/analytics/articles/{articleId}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GivenAnUnknownArticle_WhenAsking_ThenItIsNotFound()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);

        var response = await admin.GetAsync("/analytics/articles/987654321");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GivenAReader_WhenAsking_ThenIsForbidden()
    {
        var (_, authorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (reader, _) = await RoleClients.CreateAsync(_factory, UserRole.Reader);
        var articleId = await SeedArticleAsync(authorId, ArticleStatus.Published, views: 1, schoolViews: 0);

        var response = await reader.GetAsync($"/analytics/articles/{articleId}");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    /// <summary>An article by <paramref name="authorId"/> with today's summaries, as the aggregation would write them.</summary>
    private async Task<int> SeedArticleAsync(int authorId, ArticleStatus status, int views, int schoolViews, int? coAuthorId = null)
    {
        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
        var key = Guid.NewGuid().ToString("N")[..12];
        var article = new Article { Title = "Статья " + key, Slug = "article-" + key, Status = status, AuthorId = authorId };
        if (coAuthorId is int coAuthor)
        {
            article.CoAuthors.Add(new ArticleCoAuthor { UserId = coAuthor });
        }

        dbContext.Articles.Add(article);
        await dbContext.SaveChangesAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        dbContext.AnalyticsArticleDays.Add(new AnalyticsArticleDay
        {
            Day = today, ArticleId = article.Id, Views = views, Readers = views, ReachedDepth25 = views,
            OpinionsShown = 3, OpinionSwitches = 2, InternalLinkClicks = 1,
        });
        if (schoolViews > 0)
        {
            dbContext.AnalyticsArticleSchoolDays.Add(new AnalyticsArticleSchoolDay
            {
                Day = today, ArticleId = article.Id, SchoolId = dbContext.Schools.Select(s => s.Id).First(), Views = schoolViews, Readers = schoolViews,
            });
        }

        await dbContext.SaveChangesAsync();
        return article.Id;
    }
}
