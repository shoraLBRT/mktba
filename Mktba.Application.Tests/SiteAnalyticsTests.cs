using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Mktba.Application.DTOs;
using Mktba.Application.Services.Analytics;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>
/// N-05 (#99): the admin dashboard's site-wide statistics, read from the daily summaries. The same
/// scenarios run on the InMemory provider and on PostgreSQL, where the sums are grouped in SQL.
/// </summary>
public abstract class SiteAnalyticsScenarios : IAsyncLifetime
{
    private static readonly DateOnly Today = new(2026, 11, 20);
    private static readonly DateTime Now = Today.ToDateTime(new TimeOnly(15, 0), DateTimeKind.Utc);

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
        var result = await GetAsync(3);

        result.From.Should().Be(Today.AddDays(-2));
        result.To.Should().Be(Today);
        result.Daily.Should().Equal(
            new SiteAnalyticsDayDto(Today.AddDays(-2), 0, 0, 0),
            new SiteAnalyticsDayDto(Today.AddDays(-1), 0, 0, 0),
            new SiteAnalyticsDayDto(Today, 0, 0, 0));
        result.Totals.Should().Be(new SiteAnalyticsTotalsDto(0, 0, 0));
        result.TopArticles.Should().BeEmpty();
        result.Schools.Should().BeEmpty();
        result.ViewsWithoutSchool.Should().Be(0);
        result.AggregatedAtUtc.Should().BeNull();
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(-5, 1)]
    [InlineData(1000, SiteAnalyticsService.MaxDays)]
    public async Task GetAsync_GivenDaysOutOfRange_KeepsThemWithinOneToTheMaximum(int days, int expected)
    {
        var result = await GetAsync(days);

        result.Days.Should().Be(expected);
        result.Daily.Should().HaveCount(expected);
        result.Daily[^1].Day.Should().Be(Today);
    }

    [Fact]
    public async Task GetAsync_GivenSummariesInAndBeforeThePeriod_AddsUpOnlyThePeriodsDays()
    {
        var (popular, quiet, deleted) = await SeedArticlesAsync();
        var school = await SeedSchoolAsync();
        await using (var context = CreateContext())
        {
            context.AnalyticsDays.AddRange(
                SiteDay(Today.AddDays(-7), views: 100, visitors: 50, searches: 9),
                SiteDay(Today.AddDays(-1), views: 7, visitors: 3, searches: 2),
                SiteDay(Today, views: 5, visitors: 4, searches: 1));
            context.AnalyticsArticleDays.AddRange(
                ArticleDay(Today.AddDays(-7), quiet, views: 100, readers: 50),
                ArticleDay(Today.AddDays(-1), popular, views: 4, readers: 2),
                ArticleDay(Today, popular, views: 3, readers: 3),
                ArticleDay(Today.AddDays(-1), quiet, views: 3, readers: 1),
                ArticleDay(Today, deleted, views: 2, readers: 1));
            context.AnalyticsArticleSchoolDays.AddRange(
                new AnalyticsArticleSchoolDay { Day = Today.AddDays(-7), ArticleId = quiet, SchoolId = school, Views = 60, Readers = 30 },
                new AnalyticsArticleSchoolDay { Day = Today.AddDays(-1), ArticleId = popular, SchoolId = school, Views = 3, Readers = 1 },
                new AnalyticsArticleSchoolDay { Day = Today, ArticleId = popular, SchoolId = school, Views = 2, Readers = 2 },
                new AnalyticsArticleSchoolDay { Day = Today, ArticleId = popular, SchoolId = 987_654, Views = 1, Readers = 1 });
            await context.SaveChangesAsync();
        }

        var result = await GetAsync(2);

        result.Totals.Should().Be(new SiteAnalyticsTotalsDto(12, 7, 3));
        result.Daily.Should().Equal(
            new SiteAnalyticsDayDto(Today.AddDays(-1), 7, 3, 2),
            new SiteAnalyticsDayDto(Today, 5, 4, 1));
        result.TopArticles.Should().Equal(
            new AnalyticsArticleTotalDto(popular, "Популярная", "popular-" + _key, 7, 5),
            new AnalyticsArticleTotalDto(quiet, "Тихая", "quiet-" + _key, 3, 1),
            new AnalyticsArticleTotalDto(deleted, null, null, 2, 1));
        result.Schools.Should().Equal(
            new AnalyticsSchoolTotalDto(school, "Школа " + _key, 5, 3),
            new AnalyticsSchoolTotalDto(987_654, null, 1, 1));
        result.ViewsWithoutSchool.Should().Be(6);
        result.AggregatedAtUtc.Should().Be(Now.AddHours(-1));
    }

    [Fact]
    public async Task GetAsync_GivenMoreArticlesThanTheTop_ReturnsTheMostViewedOnes()
    {
        await using (var context = CreateContext())
        {
            context.AnalyticsArticleDays.AddRange(Enumerable.Range(1, SiteAnalyticsService.TopArticleCount + 2)
                .Select(id => ArticleDay(Today, 900_000 + id, views: id, readers: 1)));
            await context.SaveChangesAsync();
        }

        var result = await GetAsync(1);

        result.TopArticles.Should().HaveCount(SiteAnalyticsService.TopArticleCount);
        result.TopArticles[0].Views.Should().Be(SiteAnalyticsService.TopArticleCount + 2);
        result.TopArticles[^1].Views.Should().Be(3);
    }

    private readonly string _key = Guid.NewGuid().ToString("N")[..12];

    private async Task<SiteAnalyticsDto> GetAsync(int days)
    {
        await using var context = CreateContext();
        return await new SiteAnalyticsService(new AnalyticsSummaryRepository(context), new FeedbackTests.FakeClock(Now))
            .GetAsync(days);
    }

    private async Task<(int Popular, int Quiet, int Deleted)> SeedArticlesAsync()
    {
        await using var context = CreateContext();
        var popular = new Article { Title = "Популярная", Slug = "popular-" + _key, Status = ArticleStatus.Published };
        var quiet = new Article { Title = "Тихая", Slug = "quiet-" + _key, Status = ArticleStatus.Published };
        var gone = new Article { Title = "Удалённая", Slug = "gone-" + _key, Status = ArticleStatus.Published };
        context.Articles.AddRange(popular, quiet, gone);
        await context.SaveChangesAsync();
        context.Articles.Remove(gone);
        await context.SaveChangesAsync();
        return (popular.Id, quiet.Id, gone.Id);
    }

    private async Task<int> SeedSchoolAsync()
    {
        await using var context = CreateContext();
        var school = new School { Name = "Школа " + _key, ShortName = "Ш", Slug = "school-" + _key };
        context.Schools.Add(school);
        await context.SaveChangesAsync();
        return school.Id;
    }

    private static AnalyticsDay SiteDay(DateOnly day, int views, int visitors, int searches) => new()
    {
        Day = day,
        ArticleViews = views,
        Visitors = visitors,
        Searches = searches,
        IsFinal = day < Today,
        AggregatedAtUtc = day == Today ? Now.AddHours(-1) : day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc).AddDays(1).AddMinutes(30),
    };

    private static AnalyticsArticleDay ArticleDay(DateOnly day, int articleId, int views, int readers)
        => new() { Day = day, ArticleId = articleId, Views = views, Readers = readers };
}

/// <summary>The scenarios on the InMemory provider (a fresh database per test).</summary>
public sealed class SiteAnalyticsTests : SiteAnalyticsScenarios
{
    private readonly string _databaseName = Guid.NewGuid().ToString();

    protected override MktbaDbContext CreateContext()
        => new(new DbContextOptionsBuilder<MktbaDbContext>().UseInMemoryDatabase(_databaseName).Options);
}

/// <summary>The scenarios on PostgreSQL (<see cref="PostgresDatabaseFixture"/>).</summary>
public sealed class SiteAnalyticsPostgresTests : SiteAnalyticsScenarios, IClassFixture<PostgresDatabaseFixture>
{
    private readonly PostgresDatabaseFixture _database;

    public SiteAnalyticsPostgresTests(PostgresDatabaseFixture database)
    {
        _database = database;
    }

    protected override MktbaDbContext CreateContext() => _database.CreateContext();
}
