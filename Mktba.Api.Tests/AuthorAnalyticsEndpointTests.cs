using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Application.Services.Analytics;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>P-03 (#91): <c>GET /analytics/me</c>, the author dashboard — the signed-in user's own articles only.</summary>
public sealed class AuthorAnalyticsEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public AuthorAnalyticsEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenAnAuthor_WhenAskingWithoutDays_ThenGetsTheLastThirtyDaysEndingToday()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);

        var result = await author.GetFromJsonAsync<AuthorAnalyticsDto>("/analytics/me", ApiJson.Options);

        result!.Days.Should().Be(AuthorAnalyticsService.DefaultDays);
        result.Daily.Should().HaveCount(AuthorAnalyticsService.DefaultDays);
        result.To.Should().Be(DateOnly.FromDateTime(DateTime.UtcNow));
        result.TopArticles.Should().BeEmpty();
    }

    [Fact]
    public async Task GivenTwoAuthors_WhenEachAsks_ThenEachSeesOnlyTheirOwnArticlesNumbers()
    {
        var (first, firstId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (second, secondId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var firstArticle = await SeedArticleAsync(firstId, views: 3, schoolViews: 1);
        var secondArticle = await SeedArticleAsync(secondId, views: 50, schoolViews: 40);

        var mine = await first.GetFromJsonAsync<AuthorAnalyticsDto>("/analytics/me?days=7", ApiJson.Options);
        var theirs = await second.GetFromJsonAsync<AuthorAnalyticsDto>("/analytics/me?days=7", ApiJson.Options);

        mine!.Daily.Should().HaveCount(7);
        mine.TopArticles.Select(a => a.ArticleId).Should().Equal(firstArticle);
        mine.Totals.Views.Should().Be(3);
        mine.Depth.Views.Should().Be(3);
        mine.Schools.Sum(s => s.Views).Should().Be(1);
        mine.ViewsWithoutSchool.Should().Be(2);

        theirs!.TopArticles.Select(a => a.ArticleId).Should().Equal(secondArticle);
        theirs.Totals.Views.Should().Be(50);
        theirs.Schools.Sum(s => s.Views).Should().Be(40);
    }

    [Fact]
    public async Task GivenAReader_WhenAsking_ThenIsForbidden()
    {
        var (reader, _) = await RoleClients.CreateAsync(_factory, UserRole.Reader);

        var response = await reader.GetAsync("/analytics/me");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    /// <summary>A Published article by <paramref name="authorId"/> with today's summaries, as the aggregation would write them.</summary>
    private async Task<int> SeedArticleAsync(int authorId, int views, int schoolViews)
    {
        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
        var key = Guid.NewGuid().ToString("N")[..12];
        var article = new Article { Title = "Статья " + key, Slug = "article-" + key, Status = ArticleStatus.Published, AuthorId = authorId };
        dbContext.Articles.Add(article);
        await dbContext.SaveChangesAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var schoolId = dbContext.Schools.Select(s => s.Id).First();
        dbContext.AnalyticsArticleDays.Add(new AnalyticsArticleDay
        {
            Day = today, ArticleId = article.Id, Views = views, Readers = views, ReachedDepth25 = views,
        });
        dbContext.AnalyticsArticleSchoolDays.Add(new AnalyticsArticleSchoolDay
        {
            Day = today, ArticleId = article.Id, SchoolId = schoolId, Views = schoolViews, Readers = schoolViews,
        });
        dbContext.AnalyticsAuthorDays.Add(new AnalyticsAuthorDay { Day = today, UserId = authorId, Views = views, Readers = views, Articles = 1 });
        await dbContext.SaveChangesAsync();
        return article.Id;
    }
}
