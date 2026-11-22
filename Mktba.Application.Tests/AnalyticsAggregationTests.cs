using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.Services.Analytics;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>
/// N-04 (#98): daily summaries of the own analytics events and the retention of the raw ones. The
/// same scenarios run on the InMemory provider (<see cref="AnalyticsAggregationTests"/>) and on
/// PostgreSQL (<see cref="AnalyticsAggregationPostgresTests"/>), where the set-based deletes, the
/// transaction and the <c>date</c> columns run as in production.
/// </summary>
public abstract class AnalyticsAggregationScenarios : IAsyncLifetime
{
    private static readonly DateOnly Day = new(2026, 11, 20);
    private static readonly DateTime DayStart = Day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
    private static readonly Guid VisitorOne = Guid.Parse("11111111-1111-4111-8111-111111111111");
    private static readonly Guid VisitorTwo = Guid.Parse("22222222-2222-4222-8222-222222222222");
    private const int SchoolId = 1;

    private readonly FeedbackTests.FakeClock _clock = new(DayStart.AddDays(1).AddHours(12));
    private int _retentionDays = 180;
    private int _minSearchers = 2;

    protected abstract MktbaDbContext CreateContext();

    public async Task InitializeAsync()
    {
        // The PostgreSQL database is shared by the tests of the class.
        await using var context = CreateContext();
        context.AnalyticsEvents.RemoveRange(await context.AnalyticsEvents.ToListAsync());
        context.AnalyticsDays.RemoveRange(await context.AnalyticsDays.ToListAsync());
        context.AnalyticsArticleDays.RemoveRange(await context.AnalyticsArticleDays.ToListAsync());
        context.AnalyticsArticleSchoolDays.RemoveRange(await context.AnalyticsArticleSchoolDays.ToListAsync());
        context.AnalyticsAuthorDays.RemoveRange(await context.AnalyticsAuthorDays.ToListAsync());
        context.AnalyticsTagDays.RemoveRange(await context.AnalyticsTagDays.ToListAsync());
        context.AnalyticsSearchDays.RemoveRange(await context.AnalyticsSearchDays.ToListAsync());
        context.AnalyticsWebVitalDays.RemoveRange(await context.AnalyticsWebVitalDays.ToListAsync());
        await context.SaveChangesAsync();
    }

    [Fact]
    public async Task GivenWebVitalsOfADay_WhenAggregated_ThenEachMetricKeepsItsP75AndRatings()
    {
        var at = DayStart.AddHours(9);
        await AddEventsAsync(
            Vital(AnalyticsEventType.WebVitalLcp, at, 1200),
            Vital(AnalyticsEventType.WebVitalLcp, at, 2500),
            Vital(AnalyticsEventType.WebVitalLcp, at, 3000),
            Vital(AnalyticsEventType.WebVitalLcp, at, 4500),
            Vital(AnalyticsEventType.WebVitalCls, at, 0.05));

        await ServiceRunAsync();

        await using var context = CreateContext();
        var vitals = await context.AnalyticsWebVitalDays.Where(d => d.Day == Day).ToListAsync();
        vitals.Should().BeEquivalentTo(new[]
        {
            new { Metric = AnalyticsEventType.WebVitalLcp, Samples = 4, P75 = 3000.0, Good = 2, NeedsImprovement = 1, Poor = 1 },
            new { Metric = AnalyticsEventType.WebVitalCls, Samples = 1, P75 = 0.05, Good = 1, NeedsImprovement = 0, Poor = 0 },
        });
        (await context.AnalyticsDays.SingleAsync(d => d.Day == Day)).ArticleViews.Should().Be(0);
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task GivenADayOfEvents_WhenAggregated_ThenEverySummaryCountsThem()
    {
        var content = await SeedContentAsync();
        var at = DayStart.AddHours(10);
        await AddEventsAsync(
            View(at, content.Shared, VisitorOne, SchoolId),
            View(at, content.Shared, VisitorTwo, SchoolId),
            View(at, content.Solo, VisitorOne),
            View(at, content.Orphan, visitor: null),
            Depth(at, content.Shared, VisitorOne, 25),
            Depth(at, content.Shared, VisitorOne, 50),
            Depth(at, content.Shared, VisitorTwo, 25),
            Event(AnalyticsEventType.OpinionShown, at, content.Shared, VisitorOne),
            Event(AnalyticsEventType.OpinionSwitched, at, content.Shared, VisitorOne),
            Event(AnalyticsEventType.OpinionSwitched, at, content.Shared, VisitorOne),
            Event(AnalyticsEventType.InternalLinkClick, at, content.Shared, VisitorTwo),
            Search(at, "Намаз", VisitorOne, resultCount: 3),
            Search(at, "намаз", VisitorTwo, resultCount: 0),
            Search(at, "закят", VisitorTwo, resultCount: 0),
            View(DayStart.AddDays(1).AddHours(1), content.Solo, VisitorTwo));

        var run = await ServiceRunAsync();

        run.DaysAggregated.Should().Be(2);
        await using var context = CreateContext();
        var site = await context.AnalyticsDays.SingleAsync(d => d.Day == Day);
        site.Should().BeEquivalentTo(new { ArticleViews = 4, Visitors = 2, Searches = 3, SearchesWithoutResults = 2, IsFinal = true });
        (await context.AnalyticsDays.SingleAsync(d => d.Day == Day.AddDays(1))).IsFinal.Should().BeFalse();

        var articles = await context.AnalyticsArticleDays.Where(d => d.Day == Day).ToListAsync();
        articles.Should().HaveCount(3);
        articles.Single(a => a.ArticleId == content.Shared).Should().BeEquivalentTo(new
        {
            Views = 2,
            Readers = 2,
            OpinionsShown = 1,
            OpinionSwitches = 2,
            ReachedDepth25 = 2,
            ReachedDepth50 = 1,
            ReachedDepth75 = 0,
            ReachedDepth100 = 0,
            InternalLinkClicks = 1,
        });
        articles.Single(a => a.ArticleId == content.Orphan).Should().BeEquivalentTo(new { Views = 1, Readers = 0 });

        (await context.AnalyticsArticleSchoolDays.Where(d => d.Day == Day).ToListAsync())
            .Should().ContainSingle().Which.Should().BeEquivalentTo(new { ArticleId = content.Shared, SchoolId, Views = 2, Readers = 2 });

        var authors = await context.AnalyticsAuthorDays.Where(d => d.Day == Day).ToListAsync();
        authors.Should().HaveCount(2);
        authors.Single(a => a.UserId == content.Author).Should().BeEquivalentTo(new { Views = 3, Readers = 2, Articles = 2 });
        authors.Single(a => a.UserId == content.CoAuthor).Should().BeEquivalentTo(new { Views = 2, Readers = 2, Articles = 1 });

        (await context.AnalyticsTagDays.Where(d => d.Day == Day).ToListAsync())
            .Should().ContainSingle().Which.Should().BeEquivalentTo(new { TagId = content.Tag, Views = 3, Readers = 2, Articles = 2 });

        // The day is final: "закят", searched by one visitor only, keeps no row (N-06, #100).
        var searches = await context.AnalyticsSearchDays.Where(d => d.Day == Day).ToListAsync();
        searches.Should().BeEquivalentTo(new[]
        {
            new { Query = "намаз", Searches = 2, Searchers = 2, SearchesWithoutResults = 1 },
        });
    }

    [Fact]
    public async Task GivenAQueryOfOneVisitor_WhenItsDayIsNotFinal_ThenItIsKeptUntilTheDayBecomesFinal()
    {
        var today = DayStart.AddDays(1);
        await AddEventsAsync(
            Search(today.AddHours(1), "редкий вопрос", VisitorOne, resultCount: 0),
            Search(today.AddHours(2), "редкий вопрос", VisitorOne, resultCount: 0),
            Search(today.AddHours(3), "частый вопрос", VisitorOne, resultCount: 2),
            Search(today.AddHours(4), "частый вопрос", VisitorTwo, resultCount: null));

        await ServiceRunAsync();
        await using (var before = CreateContext())
        {
            (await before.AnalyticsSearchDays.Select(d => d.Query).ToListAsync())
                .Should().BeEquivalentTo("редкий вопрос", "частый вопрос");
        }

        _clock.Advance(TimeSpan.FromDays(1));
        await ServiceRunAsync();

        await using var after = CreateContext();
        (await after.AnalyticsSearchDays.Where(d => d.Day == Day.AddDays(1)).ToListAsync())
            .Should().ContainSingle().Which.Should().BeEquivalentTo(
                new { Query = "частый вопрос", Searches = 2, Searchers = 2, SearchesWithoutResults = 0 });
        (await after.AnalyticsDays.SingleAsync(d => d.Day == Day.AddDays(1)))
            .Should().BeEquivalentTo(new { Searches = 4, SearchesWithoutResults = 2, IsFinal = true });
    }

    [Fact]
    public async Task GivenTheThresholdSetToOne_WhenADayBecomesFinal_ThenAQueryOfOneVisitorIsKept()
    {
        _minSearchers = 1;
        await AddEventsAsync(Search(DayStart.AddHours(5), "редкий вопрос", VisitorOne, resultCount: 0));

        await ServiceRunAsync();

        await using var context = CreateContext();
        (await context.AnalyticsSearchDays.SingleAsync(d => d.Day == Day))
            .Should().BeEquivalentTo(new { Query = "редкий вопрос", Searches = 1, Searchers = 1, SearchesWithoutResults = 1 });
    }

    [Fact]
    public async Task GivenTodayAggregated_WhenMoreEventsArriveAndItRunsAgain_ThenTodayIsReplacedNotAddedTo()
    {
        var content = await SeedContentAsync();
        var today = DayStart.AddDays(1);
        await AddEventsAsync(View(today.AddHours(1), content.Solo, VisitorOne));
        await ServiceRunAsync();
        await ServiceRunAsync();

        await AddEventsAsync(View(today.AddHours(11), content.Solo, VisitorTwo));
        await ServiceRunAsync();

        await using var context = CreateContext();
        var rows = await context.AnalyticsArticleDays.Where(d => d.ArticleId == content.Solo).ToListAsync();
        rows.Should().ContainSingle().Which.Should().BeEquivalentTo(new { Day = Day.AddDays(1), Views = 2, Readers = 2 });
        (await context.AnalyticsAuthorDays.Where(d => d.UserId == content.Author).ToListAsync())
            .Should().ContainSingle().Which.Views.Should().Be(2);
    }

    [Fact]
    public async Task GivenAFinalDay_WhenAnEventOfThatDayTurnsUpLater_ThenTheDayIsNotRebuilt()
    {
        var content = await SeedContentAsync();
        await AddEventsAsync(View(DayStart.AddHours(9), content.Solo, VisitorOne));
        await ServiceRunAsync();

        await AddEventsAsync(View(DayStart.AddHours(23), content.Solo, VisitorTwo));
        var run = await ServiceRunAsync();

        run.DaysAggregated.Should().Be(1, "only today is rebuilt once yesterday is final");
        await using var context = CreateContext();
        (await context.AnalyticsArticleDays.SingleAsync(d => d.Day == Day && d.ArticleId == content.Solo)).Views.Should().Be(1);
    }

    [Fact]
    public async Task GivenADayThatEndedMomentsAgo_WhenAggregated_ThenItBecomesFinalOnlyAfterTheSettleTime()
    {
        var content = await SeedContentAsync();
        await AddEventsAsync(View(DayStart.AddHours(23).AddMinutes(59), content.Solo, VisitorOne));
        _clock.Advance(DayStart.AddDays(1).AddMinutes(5) - _clock.GetUtcNow().UtcDateTime);

        await ServiceRunAsync();
        await using (var before = CreateContext())
        {
            (await before.AnalyticsDays.SingleAsync(d => d.Day == Day)).IsFinal.Should().BeFalse();
        }

        _clock.Advance(AnalyticsAggregationService.SettleTime);
        var run = await ServiceRunAsync();

        run.DaysAggregated.Should().Be(2);
        await using var after = CreateContext();
        (await after.AnalyticsDays.SingleAsync(d => d.Day == Day)).IsFinal.Should().BeTrue();
    }

    [Fact]
    public async Task GivenEventsOlderThanTheRetention_WhenTheirDayIsFinal_ThenTheyAreRemovedAndTheSummariesStay()
    {
        var content = await SeedContentAsync();
        _retentionDays = 2;
        var old = DayStart.AddDays(-5).AddHours(10);
        await AddEventsAsync(
            View(old, content.Solo, VisitorOne),
            View(DayStart.AddHours(10), content.Solo, VisitorOne));

        var run = await ServiceRunAsync();

        run.EventsRemoved.Should().Be(1);
        await using var context = CreateContext();
        (await context.AnalyticsEvents.Select(e => e.OccurredAtUtc).ToListAsync()).Should().Equal(DayStart.AddHours(10));
        (await context.AnalyticsArticleDays.SingleAsync(d => d.Day == Day.AddDays(-5))).Views.Should().Be(1);
        (await context.AnalyticsDays.CountAsync()).Should().Be(7, "every day from the oldest event through today has its row");
    }

    [Fact]
    public async Task GivenRetentionTurnedOff_WhenItRuns_ThenNoEventIsRemoved()
    {
        var content = await SeedContentAsync();
        _retentionDays = 0;
        await AddEventsAsync(View(DayStart.AddDays(-10), content.Solo, VisitorOne));

        var run = await ServiceRunAsync();

        run.EventsRemoved.Should().Be(0);
        await using var context = CreateContext();
        (await context.AnalyticsEvents.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task GivenNoEvents_WhenItRuns_ThenNothingIsAggregated()
    {
        var run = await ServiceRunAsync();

        run.Should().Be(new AnalyticsAggregationRun(DaysAggregated: 0, EventsRemoved: 0));
        await using var context = CreateContext();
        (await context.AnalyticsDays.CountAsync()).Should().Be(0);
    }

    private async Task<AnalyticsAggregationRun> ServiceRunAsync()
    {
        await using var context = CreateContext();
        var service = new AnalyticsAggregationService(
            new AnalyticsSummaryRepository(context),
            _clock,
            Options.Create(new AnalyticsOptions { RetentionDays = _retentionDays, SearchQueryMinSearchers = _minSearchers }));
        return await service.RunAsync();
    }

    private sealed record Content(int Shared, int Solo, int Orphan, int Author, int CoAuthor, int Tag);

    /// <summary>
    /// Shared: by the author with a co-author, tagged; Solo: by the author alone, tagged the same;
    /// Orphan: no author, no tag.
    /// </summary>
    private async Task<Content> SeedContentAsync()
    {
        var key = Guid.NewGuid().ToString("N")[..12];
        await using var context = CreateContext();
        var author = new User { Email = $"author-{key}@mktba.test", PasswordHash = "hash", Role = UserRole.Author };
        var coAuthor = new User { Email = $"coauthor-{key}@mktba.test", PasswordHash = "hash", Role = UserRole.Author };
        var tag = new Tag { Name = $"Тег {key}", NormalizedName = $"тег {key}", Slug = $"tag-{key}" };
        var shared = new Article { Title = "Общая", Slug = $"shared-{key}", Status = ArticleStatus.Published, Author = author };
        shared.CoAuthors.Add(new ArticleCoAuthor { User = coAuthor });
        shared.TagLinks.Add(new ArticleTag { Tag = tag, Order = 0 });
        var solo = new Article { Title = "Своя", Slug = $"solo-{key}", Status = ArticleStatus.Published, Author = author };
        solo.TagLinks.Add(new ArticleTag { Tag = tag, Order = 0 });
        var orphan = new Article { Title = "Ничья", Slug = $"orphan-{key}", Status = ArticleStatus.Published };
        context.Articles.AddRange(shared, solo, orphan);
        await context.SaveChangesAsync();
        return new Content(shared.Id, solo.Id, orphan.Id, author.Id, coAuthor.Id, tag.Id);
    }

    private async Task AddEventsAsync(params AnalyticsEvent[] events)
    {
        await using var context = CreateContext();
        context.AnalyticsEvents.AddRange(events);
        await context.SaveChangesAsync();
    }

    private static AnalyticsEvent View(DateTime at, int articleId, Guid? visitor, int? schoolId = null)
        => new() { Type = AnalyticsEventType.ArticleView, OccurredAtUtc = at, ArticleId = articleId, VisitorId = visitor, SchoolId = schoolId, ViewId = Guid.NewGuid() };

    private static AnalyticsEvent Depth(DateTime at, int articleId, Guid visitor, short depth)
        => Event(AnalyticsEventType.ScrollDepth, at, articleId, visitor, e => e.ScrollDepth = depth);

    private static AnalyticsEvent Search(DateTime at, string query, Guid visitor, int? resultCount)
        => new() { Type = AnalyticsEventType.Search, OccurredAtUtc = at, Query = query, VisitorId = visitor, ResultCount = resultCount };

    private static AnalyticsEvent Vital(AnalyticsEventType metric, DateTime at, double value)
        => new() { Type = metric, OccurredAtUtc = at, MetricValue = value, ViewId = Guid.NewGuid() };

    private static AnalyticsEvent Event(AnalyticsEventType type, DateTime at, int articleId, Guid visitor, Action<AnalyticsEvent>? fill = null)
    {
        var e = new AnalyticsEvent { Type = type, OccurredAtUtc = at, ArticleId = articleId, VisitorId = visitor };
        fill?.Invoke(e);
        return e;
    }
}

/// <summary>The scenarios on the InMemory provider (a fresh database per test).</summary>
public sealed class AnalyticsAggregationTests : AnalyticsAggregationScenarios
{
    private readonly string _databaseName = Guid.NewGuid().ToString();

    protected override MktbaDbContext CreateContext()
        => new(new DbContextOptionsBuilder<MktbaDbContext>().UseInMemoryDatabase(_databaseName).Options);
}

/// <summary>The scenarios on PostgreSQL (<see cref="PostgresDatabaseFixture"/>).</summary>
public sealed class AnalyticsAggregationPostgresTests : AnalyticsAggregationScenarios, IClassFixture<PostgresDatabaseFixture>
{
    private readonly PostgresDatabaseFixture _database;

    public AnalyticsAggregationPostgresTests(PostgresDatabaseFixture database)
    {
        _database = database;
    }

    protected override MktbaDbContext CreateContext() => _database.CreateContext();
}
