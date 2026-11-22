using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Services.Analytics;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>
/// N-06 (#100): the search analytics of the admin dashboard, read from the daily summaries. The same
/// scenarios run on the InMemory provider and on PostgreSQL, where the sums are grouped in SQL.
/// </summary>
public abstract class SearchAnalyticsScenarios : IAsyncLifetime
{
    private static readonly DateOnly Today = new(2026, 11, 20);
    private static readonly DateTime Now = Today.ToDateTime(new TimeOnly(15, 0), DateTimeKind.Utc);

    protected abstract MktbaDbContext CreateContext();

    public async Task InitializeAsync()
    {
        // The PostgreSQL database is shared by the tests of the class.
        await using var context = CreateContext();
        context.AnalyticsDays.RemoveRange(await context.AnalyticsDays.ToListAsync());
        context.AnalyticsSearchDays.RemoveRange(await context.AnalyticsSearchDays.ToListAsync());
        await context.SaveChangesAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task GetAsync_GivenNoSummaries_ReturnsAnEmptyPeriod()
    {
        var result = await GetAsync(7);

        result.Days.Should().Be(7);
        result.From.Should().Be(Today.AddDays(-6));
        result.To.Should().Be(Today);
        result.Totals.Should().Be(new SearchAnalyticsTotalsDto(0, 0));
        result.TopQueries.Should().BeEmpty();
        result.QueriesWithoutResults.Should().BeEmpty();
        result.MinSearchers.Should().Be(2);
        result.AggregatedAtUtc.Should().BeNull();
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(1000, SearchAnalyticsService.MaxDays)]
    public async Task GetAsync_GivenDaysOutOfRange_KeepsThemWithinOneToTheMaximum(int days, int expected)
    {
        (await GetAsync(days)).Days.Should().Be(expected);
    }

    [Fact]
    public async Task GetAsync_GivenQueriesOverSeveralDays_AddsThemUpOnlyOnTheDaysEnoughVisitorsMadeThem()
    {
        await using (var context = CreateContext())
        {
            context.AnalyticsDays.AddRange(
                SiteDay(Today.AddDays(-10), searches: 50, withoutResults: 40),
                SiteDay(Today.AddDays(-1), searches: 12, withoutResults: 7),
                SiteDay(Today, searches: 5, withoutResults: 1));
            context.AnalyticsSearchDays.AddRange(
                // Before the period.
                SearchDay(Today.AddDays(-10), "намаз", searches: 40, searchers: 30, withoutResults: 40),
                SearchDay(Today.AddDays(-1), "намаз", searches: 3, searchers: 2, withoutResults: 0),
                SearchDay(Today, "намаз", searches: 2, searchers: 2, withoutResults: 0),
                SearchDay(Today.AddDays(-1), "закят с золота", searches: 4, searchers: 2, withoutResults: 4),
                // One visitor that day: not shown, though today is not final yet.
                SearchDay(Today, "закят с золота", searches: 1, searchers: 1, withoutResults: 1),
                SearchDay(Today.AddDays(-1), "ифтар", searches: 3, searchers: 3, withoutResults: 1),
                SearchDay(Today.AddDays(-1), "суджуд сахв", searches: 3, searchers: 2, withoutResults: 2),
                SearchDay(Today, "редкая фраза", searches: 3, searchers: 1, withoutResults: 3));
            await context.SaveChangesAsync();
        }

        var result = await GetAsync(7);

        result.Totals.Should().Be(new SearchAnalyticsTotalsDto(17, 8));
        result.TopQueries.Should().Equal(
            new SearchQueryTotalDto("намаз", 5, 4, 0),
            new SearchQueryTotalDto("закят с золота", 4, 2, 4),
            new SearchQueryTotalDto("ифтар", 3, 3, 1),
            new SearchQueryTotalDto("суджуд сахв", 3, 2, 2));
        result.QueriesWithoutResults.Should().Equal(
            new SearchQueryTotalDto("закят с золота", 4, 2, 4),
            new SearchQueryTotalDto("суджуд сахв", 3, 2, 2),
            new SearchQueryTotalDto("ифтар", 3, 3, 1));
        result.AggregatedAtUtc.Should().Be(Now.AddHours(-1));
    }

    [Fact]
    public async Task GetAsync_GivenManyQueries_ListsAtMostTwentyOfEach()
    {
        await using (var context = CreateContext())
        {
            context.AnalyticsSearchDays.AddRange(Enumerable.Range(1, SearchAnalyticsService.QueryCount + 5)
                .Select(i => SearchDay(Today, $"вопрос {i:D2}", searches: i, searchers: 2, withoutResults: 1)));
            await context.SaveChangesAsync();
        }

        var result = await GetAsync(1);

        result.TopQueries.Should().HaveCount(SearchAnalyticsService.QueryCount);
        result.TopQueries[0].Query.Should().Be($"вопрос {SearchAnalyticsService.QueryCount + 5:D2}");
        result.QueriesWithoutResults.Should().HaveCount(SearchAnalyticsService.QueryCount);
    }

    private async Task<SearchAnalyticsDto> GetAsync(int days)
    {
        await using var context = CreateContext();
        return await new SearchAnalyticsService(
                new AnalyticsSummaryRepository(context),
                new FeedbackTests.FakeClock(Now),
                Options.Create(new AnalyticsOptions()))
            .GetAsync(days);
    }

    private static AnalyticsDay SiteDay(DateOnly day, int searches, int withoutResults) => new()
    {
        Day = day,
        Searches = searches,
        SearchesWithoutResults = withoutResults,
        IsFinal = day < Today,
        AggregatedAtUtc = day == Today ? Now.AddHours(-1) : day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc).AddDays(1).AddMinutes(30),
    };

    private static AnalyticsSearchDay SearchDay(DateOnly day, string query, int searches, int searchers, int withoutResults)
        => new() { Day = day, Query = query, Searches = searches, Searchers = searchers, SearchesWithoutResults = withoutResults };
}

/// <summary>The scenarios on the InMemory provider (a fresh database per test).</summary>
public sealed class SearchAnalyticsTests : SearchAnalyticsScenarios
{
    private readonly string _databaseName = Guid.NewGuid().ToString();

    protected override MktbaDbContext CreateContext()
        => new(new DbContextOptionsBuilder<MktbaDbContext>().UseInMemoryDatabase(_databaseName).Options);
}

/// <summary>The scenarios on PostgreSQL (<see cref="PostgresDatabaseFixture"/>).</summary>
public sealed class SearchAnalyticsPostgresTests : SearchAnalyticsScenarios, IClassFixture<PostgresDatabaseFixture>
{
    private readonly PostgresDatabaseFixture _database;

    public SearchAnalyticsPostgresTests(PostgresDatabaseFixture database)
    {
        _database = database;
    }

    protected override MktbaDbContext CreateContext() => _database.CreateContext();
}
