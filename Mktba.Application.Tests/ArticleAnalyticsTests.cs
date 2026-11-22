using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Analytics;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>
/// N-09 (#103): one article's statistics, read from the daily summaries. The same scenarios run on
/// the InMemory provider and on PostgreSQL.
/// </summary>
public abstract class ArticleAnalyticsScenarios : IAsyncLifetime
{
    private static readonly DateOnly Today = new(2026, 11, 20);
    private static readonly DateTime Now = Today.ToDateTime(new TimeOnly(15, 0), DateTimeKind.Utc);

    private readonly string _key = Guid.NewGuid().ToString("N")[..12];

    protected abstract MktbaDbContext CreateContext();

    public async Task InitializeAsync()
    {
        // The PostgreSQL database is shared by the tests of the class.
        await using var context = CreateContext();
        context.AnalyticsDays.RemoveRange(await context.AnalyticsDays.ToListAsync());
        context.AnalyticsArticleDays.RemoveRange(await context.AnalyticsArticleDays.ToListAsync());
        context.AnalyticsArticleSchoolDays.RemoveRange(await context.AnalyticsArticleSchoolDays.ToListAsync());
        await context.SaveChangesAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task GetAsync_GivenNoSummaries_ReturnsEveryDayOfThePeriodEmpty()
    {
        var (article, _) = await SeedArticlesAsync();

        var result = await GetAsync(article, 3);

        result.ArticleId.Should().Be(article);
        result.Title.Should().Be("Статья " + _key);
        result.Slug.Should().Be("article-" + _key);
        result.From.Should().Be(Today.AddDays(-2));
        result.To.Should().Be(Today);
        result.Daily.Should().Equal(
            new ArticleAnalyticsDayDto(Today.AddDays(-2), 0, 0, 0, 0),
            new ArticleAnalyticsDayDto(Today.AddDays(-1), 0, 0, 0, 0),
            new ArticleAnalyticsDayDto(Today, 0, 0, 0, 0));
        result.Totals.Should().Be(new ArticleAnalyticsTotalsDto(0, 0, 0, 0, 0));
        result.Depth.Should().Be(new ReadDepthDto(0, 0, 0, 0, 0));
        result.Schools.Should().BeEmpty();
        result.ViewsWithoutSchool.Should().Be(0);
        result.AggregatedAtUtc.Should().BeNull();
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(-5, 1)]
    [InlineData(1000, ArticleAnalyticsService.MaxDays)]
    public async Task GetAsync_GivenDaysOutOfRange_KeepsThemWithinOneToTheMaximum(int days, int expected)
    {
        var (article, _) = await SeedArticlesAsync();

        var result = await GetAsync(article, days);

        result.Days.Should().Be(expected);
        result.Daily.Should().HaveCount(expected);
        result.Daily[^1].Day.Should().Be(Today);
    }

    [Fact]
    public async Task GetAsync_GivenSummariesOfSeveralArticles_ReturnsOnlyThatArticleOverThePeriod()
    {
        var (article, other) = await SeedArticlesAsync();
        int school;
        await using (var context = CreateContext())
        {
            var entity = new School { Name = "Школа " + _key, ShortName = "Ш", Slug = "school-" + _key };
            context.Schools.Add(entity);
            await context.SaveChangesAsync();
            school = entity.Id;

            context.AnalyticsDays.AddRange(SiteDay(Today.AddDays(-1)), SiteDay(Today));
            context.AnalyticsArticleDays.AddRange(
                ArticleDay(Today.AddDays(-7), article, views: 100),
                ArticleDay(Today.AddDays(-1), article, views: 6),
                ArticleDay(Today, article, views: 4),
                ArticleDay(Today, other, views: 50));
            context.AnalyticsArticleSchoolDays.AddRange(
                new AnalyticsArticleSchoolDay { Day = Today.AddDays(-7), ArticleId = article, SchoolId = school, Views = 90, Readers = 90 },
                new AnalyticsArticleSchoolDay { Day = Today, ArticleId = article, SchoolId = school, Views = 3, Readers = 2 },
                new AnalyticsArticleSchoolDay { Day = Today, ArticleId = other, SchoolId = school, Views = 40, Readers = 40 });
            await context.SaveChangesAsync();
        }

        var result = await GetAsync(article, 2);

        result.Daily.Should().Equal(
            new ArticleAnalyticsDayDto(Today.AddDays(-1), 6, 3, 2, 1),
            new ArticleAnalyticsDayDto(Today, 4, 2, 2, 1));
        result.Totals.Should().Be(new ArticleAnalyticsTotalsDto(10, 5, 4, 4, 2));
        result.Depth.Should().Be(new ReadDepthDto(10, 10, 5, 3, 1));
        result.Schools.Should().Equal(new AnalyticsSchoolTotalDto(school, "Школа " + _key, 3, 2));
        result.ViewsWithoutSchool.Should().Be(7);
        result.AggregatedAtUtc.Should().Be(Now.AddHours(-1));
    }

    [Fact]
    public async Task GetAsync_GivenAnUnknownArticle_ThrowsNotFound()
    {
        var act = () => GetAsync(987654321, 7);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    private async Task<ArticleAnalyticsDto> GetAsync(int articleId, int days)
    {
        await using var context = CreateContext();
        return await new ArticleAnalyticsService(new AnalyticsSummaryRepository(context), new FeedbackTests.FakeClock(Now))
            .GetAsync(articleId, days);
    }

    /// <summary>The article asked about and another one.</summary>
    private async Task<(int Article, int Other)> SeedArticlesAsync()
    {
        await using var context = CreateContext();
        var article = new Article { Title = "Статья " + _key, Slug = "article-" + _key, Status = ArticleStatus.Published };
        var other = new Article { Title = "Другая " + _key, Slug = "other-" + _key, Status = ArticleStatus.Published };
        context.Articles.AddRange(article, other);
        await context.SaveChangesAsync();
        return (article.Id, other.Id);
    }

    private static AnalyticsDay SiteDay(DateOnly day) => new()
    {
        Day = day,
        ArticleViews = 1,
        Visitors = 1,
        IsFinal = day < Today,
        AggregatedAtUtc = day == Today ? Now.AddHours(-1) : day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc).AddDays(1).AddMinutes(30),
    };

    // Readers are half the views, depth falls by steps; switches and clicks are fixed per day.
    private static AnalyticsArticleDay ArticleDay(DateOnly day, int articleId, int views) => new()
    {
        Day = day,
        ArticleId = articleId,
        Views = views,
        Readers = views / 2,
        OpinionsShown = 2,
        OpinionSwitches = 2,
        InternalLinkClicks = 1,
        ReachedDepth25 = views,
        ReachedDepth50 = views * 6 / 10,
        ReachedDepth75 = views * 4 / 10,
        ReachedDepth100 = views * 2 / 10,
    };
}

/// <summary>The scenarios on the InMemory provider (a fresh database per test).</summary>
public sealed class ArticleAnalyticsTests : ArticleAnalyticsScenarios
{
    private readonly string _databaseName = Guid.NewGuid().ToString();

    protected override MktbaDbContext CreateContext()
        => new(new DbContextOptionsBuilder<MktbaDbContext>().UseInMemoryDatabase(_databaseName).Options);
}

/// <summary>The scenarios on PostgreSQL (<see cref="PostgresDatabaseFixture"/>).</summary>
public sealed class ArticleAnalyticsPostgresTests : ArticleAnalyticsScenarios, IClassFixture<PostgresDatabaseFixture>
{
    private readonly PostgresDatabaseFixture _database;

    public ArticleAnalyticsPostgresTests(PostgresDatabaseFixture database)
    {
        _database = database;
    }

    protected override MktbaDbContext CreateContext() => _database.CreateContext();
}
