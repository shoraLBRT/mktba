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
/// N-07 (#101): the content analytics of the admin dashboard — unread articles, stubs with readers,
/// blocks of opinions missing a mazhab and out-of-date articles. The same scenarios run on the
/// InMemory provider and on PostgreSQL, where the sums are grouped in SQL.
/// </summary>
public abstract class ContentAnalyticsScenarios : IAsyncLifetime
{
    private static readonly DateOnly Today = new(2026, 11, 20);
    private static readonly DateTime Now = Today.ToDateTime(new TimeOnly(15, 0), DateTimeKind.Utc);

    private readonly string _key = Guid.NewGuid().ToString("N")[..12];

    protected abstract MktbaDbContext CreateContext();

    public async Task InitializeAsync()
    {
        // The PostgreSQL database is shared by the tests of the class, and the service reads every article.
        await using var context = CreateContext();
        context.AnalyticsDays.RemoveRange(await context.AnalyticsDays.ToListAsync());
        context.AnalyticsArticleDays.RemoveRange(await context.AnalyticsArticleDays.ToListAsync());
        context.AnalyticsArticleSchoolDays.RemoveRange(await context.AnalyticsArticleSchoolDays.ToListAsync());
        context.Schools.RemoveRange(await context.Schools.ToListAsync());
        await context.SaveChangesAsync();
        context.Articles.RemoveRange(await context.Articles.ToListAsync());
        await context.SaveChangesAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task GetAsync_GivenNothing_ReturnsEmptyListsForThePeriod()
    {
        var result = await GetAsync(7);

        result.Days.Should().Be(7);
        result.From.Should().Be(Today.AddDays(-6));
        result.To.Should().Be(Today);
        result.ArticlesWithoutViews.Total.Should().Be(0);
        result.ArticlesWithoutViews.Items.Should().BeEmpty();
        result.StubsWithTraffic.Total.Should().Be(0);
        result.UncoveredBlocks.Total.Should().Be(0);
        result.StaleArticles.Total.Should().Be(0);
        result.StaleAfterDays.Should().Be(365);
        result.AggregatedAtUtc.Should().BeNull();
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(1000, ContentAnalyticsService.MaxDays)]
    public async Task GetAsync_GivenDaysOutOfRange_KeepsThemWithinOneToTheMaximum(int days, int expected)
    {
        (await GetAsync(days)).Days.Should().Be(expected);
    }

    [Fact]
    public async Task GetAsync_GivenArticlesWithAndWithoutViews_ListsOnlyPublishedContentNotViewedSinceBeforeThePeriod()
    {
        int oldest, older, viewed;
        await using (var context = CreateContext())
        {
            var oldestArticle = Article("oldest", publishedDaysAgo: 100);
            var olderArticle = Article("older", publishedDaysAgo: 40);
            var viewedArticle = Article("viewed", publishedDaysAgo: 50);
            context.Articles.AddRange(
                olderArticle,
                oldestArticle,
                viewedArticle,
                // Published inside the period: it has not had the whole period yet.
                Article("fresh", publishedDaysAgo: 2),
                Article("draft", publishedDaysAgo: 60, status: ArticleStatus.Draft),
                Article("stub", publishedDaysAgo: 60, stub: true));
            await context.SaveChangesAsync();
            (oldest, older, viewed) = (oldestArticle.Id, olderArticle.Id, viewedArticle.Id);

            context.AnalyticsArticleDays.AddRange(
                ArticleDay(viewed, Today.AddDays(-3), views: 2, readers: 2),
                // Before the period: does not count.
                ArticleDay(older, Today.AddDays(-20), views: 9, readers: 5));
            context.AnalyticsDays.Add(SiteDay(Today.AddDays(-3)));
            await context.SaveChangesAsync();
        }

        var result = await GetAsync(7);

        result.ArticlesWithoutViews.Total.Should().Be(2);
        result.ArticlesWithoutViews.Items.Select(a => a.ArticleId).Should().Equal(oldest, older);
        var entry = result.ArticlesWithoutViews.Items[0];
        entry.Title.Should().Be("oldest");
        entry.Slug.Should().Be("oldest-" + _key);
        entry.PublishedAt.Should().Be(Now.AddDays(-100));
        entry.Views.Should().Be(0);
        result.AggregatedAtUtc.Should().Be(Today.AddDays(-2).ToDateTime(new TimeOnly(0, 30), DateTimeKind.Utc));
    }

    [Fact]
    public async Task GetAsync_GivenStubs_ListsThoseViewedInThePeriodMostViewsFirst()
    {
        int busy, quiet;
        await using (var context = CreateContext())
        {
            var busyStub = Article("busy-stub", publishedDaysAgo: 30, stub: true);
            var quietStub = Article("quiet-stub", publishedDaysAgo: 30, stub: true);
            var unseenStub = Article("unseen-stub", publishedDaysAgo: 30, stub: true);
            var oldTrafficStub = Article("old-traffic-stub", publishedDaysAgo: 30, stub: true);
            var withContent = Article("with-content", publishedDaysAgo: 30);
            context.Articles.AddRange(busyStub, quietStub, unseenStub, oldTrafficStub, withContent);
            await context.SaveChangesAsync();
            (busy, quiet) = (busyStub.Id, quietStub.Id);

            context.AnalyticsArticleDays.AddRange(
                ArticleDay(quiet, Today, views: 2, readers: 1),
                ArticleDay(busy, Today.AddDays(-1), views: 5, readers: 4),
                ArticleDay(busy, Today, views: 3, readers: 3),
                ArticleDay(oldTrafficStub.Id, Today.AddDays(-30), views: 50, readers: 40),
                ArticleDay(withContent.Id, Today, views: 100, readers: 80));
            await context.SaveChangesAsync();
        }

        var result = await GetAsync(7);

        result.StubsWithTraffic.Total.Should().Be(2);
        result.StubsWithTraffic.Items.Select(a => (a.ArticleId, a.Views, a.Readers)).Should().Equal((busy, 8, 7), (quiet, 2, 1));
    }

    [Fact]
    public async Task GetAsync_GivenBlocksOfOpinions_ListsThoseMissingACanonicalMazhabMostViewsOfItsReadersFirst()
    {
        int first, second;
        School hanafi, maliki, shafii, hanbali;
        await using (var context = CreateContext())
        {
            (hanafi, maliki, shafii, hanbali) = (School("hanafi", "Ханафитский"), School("maliki", "Маликитский"),
                School("shafii", "Шафиитский"), School("hanbali", "Ханбалитский"));
            context.Schools.AddRange(hanafi, maliki, shafii, hanbali);

            var firstArticle = Article("first", publishedDaysAgo: 30);
            firstArticle.Paragraphs = [
                // A plain paragraph is common to every mazhab.
                Paragraph(0, Opinion(isDefault: true)),
                // Every canonical mazhab has its opinion.
                Paragraph(1, Opinion(isDefault: true, hanafi, maliki), Opinion(isDefault: false, shafii, hanbali)),
                // Maliki, Shafi'i and Hanbali readers get the default opinion.
                Paragraph(2, Opinion(isDefault: true), Opinion(isDefault: false, hanafi)),
            ];
            var secondArticle = Article("second", publishedDaysAgo: 30);
            var custom = new School { Name = "Своя школа", ShortName = "С", Slug = "custom-" + _key, ArticleScope = secondArticle };
            secondArticle.Paragraphs = [
                // Only Hanbali is missing; a custom school does not stand in for it.
                Paragraph(5, Opinion(isDefault: true, hanafi, maliki, shafii), Opinion(isDefault: false, custom)),
            ];
            var draft = Article("draft", publishedDaysAgo: 30, status: ArticleStatus.Draft);
            draft.Paragraphs = [Paragraph(0, Opinion(isDefault: true), Opinion(isDefault: false, hanafi))];
            context.Articles.AddRange(firstArticle, secondArticle, draft);
            await context.SaveChangesAsync();
            (first, second) = (firstArticle.Id, secondArticle.Id);

            context.AnalyticsArticleDays.AddRange(
                ArticleDay(first, Today, views: 30, readers: 20),
                ArticleDay(second, Today, views: 12, readers: 10));
            context.AnalyticsArticleSchoolDays.AddRange(
                SchoolDay(first, hanafi.Id, Today, views: 20),
                SchoolDay(first, maliki.Id, Today, views: 3),
                SchoolDay(first, shafii.Id, Today.AddDays(-1), views: 2),
                // Before the period.
                SchoolDay(first, hanbali.Id, Today.AddDays(-40), views: 100),
                SchoolDay(second, hanbali.Id, Today, views: 9));
            await context.SaveChangesAsync();
        }

        var result = await GetAsync(7);

        result.UncoveredBlocks.Total.Should().Be(2);
        var top = result.UncoveredBlocks.Items[0];
        top.ArticleId.Should().Be(second);
        top.Slug.Should().Be("second-" + _key);
        top.Position.Should().Be(1);
        top.Opinions.Should().Be(2);
        top.MissingSchools.Should().Equal("Ханбалитский");
        top.MissingSchoolViews.Should().Be(9);
        top.ArticleViews.Should().Be(12);
        var next = result.UncoveredBlocks.Items[1];
        next.ArticleId.Should().Be(first);
        next.Position.Should().Be(3);
        next.MissingSchools.Should().BeEquivalentTo("Маликитский", "Шафиитский", "Ханбалитский");
        next.MissingSchoolViews.Should().Be(5);
        next.ArticleViews.Should().Be(30);
    }

    [Fact]
    public async Task GetAsync_GivenArticlesNotSavedForLong_ListsThemMostViewsFirst()
    {
        int readOne, unreadOne;
        await using (var context = CreateContext())
        {
            var read = Article("read-stale", publishedDaysAgo: 800, updatedDaysAgo: 400);
            var unread = Article("unread-stale", publishedDaysAgo: 800, updatedDaysAgo: 500);
            context.Articles.AddRange(
                unread,
                read,
                Article("recent", publishedDaysAgo: 800, updatedDaysAgo: 10),
                Article("stale-stub", publishedDaysAgo: 800, updatedDaysAgo: 500, stub: true));
            await context.SaveChangesAsync();
            (readOne, unreadOne) = (read.Id, unread.Id);
            context.AnalyticsArticleDays.Add(ArticleDay(readOne, Today, views: 4, readers: 3));
            await context.SaveChangesAsync();
        }

        var result = await GetAsync(30);

        result.StaleArticles.Total.Should().Be(2);
        result.StaleArticles.Items.Select(a => (a.ArticleId, a.Views)).Should().Equal((readOne, 4), (unreadOne, 0));
        result.StaleArticles.Items[1].UpdatedAt.Should().Be(Now.AddDays(-500));
    }

    [Fact]
    public async Task GetAsync_GivenAThresholdBelowOneDay_CountsItAsOneDay()
    {
        await using (var context = CreateContext())
        {
            context.Articles.AddRange(
                Article("yesterday", publishedDaysAgo: 10, updatedDaysAgo: 2),
                Article("just-now", publishedDaysAgo: 10, updatedDaysAgo: 0));
            await context.SaveChangesAsync();
        }

        var result = await GetAsync(7, new AnalyticsOptions { StaleArticleDays = 0 });

        result.StaleAfterDays.Should().Be(1);
        result.StaleArticles.Items.Select(a => a.Title).Should().Equal("yesterday");
    }

    [Fact]
    public async Task GetAsync_GivenManyMatchingArticles_ListsFiftyAndCountsThemAll()
    {
        await using (var context = CreateContext())
        {
            context.Articles.AddRange(Enumerable.Range(1, ContentAnalyticsService.ListLimit + 5)
                .Select(i => Article($"unread-{i:D2}", publishedDaysAgo: 100 + i)));
            await context.SaveChangesAsync();
        }

        var result = await GetAsync(7);

        result.ArticlesWithoutViews.Total.Should().Be(ContentAnalyticsService.ListLimit + 5);
        result.ArticlesWithoutViews.Items.Should().HaveCount(ContentAnalyticsService.ListLimit);
        result.ArticlesWithoutViews.Items[0].Title.Should().Be($"unread-{ContentAnalyticsService.ListLimit + 5:D2}");
    }

    private async Task<ContentAnalyticsDto> GetAsync(int days, AnalyticsOptions? options = null)
    {
        await using var context = CreateContext();
        return await new ContentAnalyticsService(
                new AnalyticsSummaryRepository(context),
                new ArticleRepository(context),
                new FeedbackTests.FakeClock(Now),
                Options.Create(options ?? new AnalyticsOptions()))
            .GetAsync(days);
    }

    /// <summary>A Published article with a summary (or a stub with none), dated relative to now.</summary>
    private Article Article(
        string title, int publishedDaysAgo, int? updatedDaysAgo = null, bool stub = false, ArticleStatus status = ArticleStatus.Published) => new()
    {
        Title = title,
        Slug = $"{title}-{_key}",
        Status = status,
        Summary = stub ? null : "Текст",
        PublishedAt = status == ArticleStatus.Published ? Now.AddDays(-publishedDaysAgo) : null,
        CreatedAt = Now.AddDays(-publishedDaysAgo - 1),
        UpdatedAt = Now.AddDays(-(updatedDaysAgo ?? publishedDaysAgo)),
    };

    private School School(string slug, string name)
        => new() { Name = name, ShortName = name[..1], Slug = $"{slug}-{_key}", IsSystem = true };

    private static Paragraph Paragraph(int order, params Opinion[] opinions) => new() { Order = order, Opinions = opinions.ToList() };

    private static Opinion Opinion(bool isDefault, params School[] schools) => new()
    {
        Content = "Мнение",
        IsDefault = isDefault,
        OpinionSchools = schools.Select(school => new OpinionSchool { School = school }).ToList(),
    };

    private static AnalyticsArticleDay ArticleDay(int articleId, DateOnly day, int views, int readers)
        => new() { ArticleId = articleId, Day = day, Views = views, Readers = readers };

    private static AnalyticsArticleSchoolDay SchoolDay(int articleId, int schoolId, DateOnly day, int views)
        => new() { ArticleId = articleId, SchoolId = schoolId, Day = day, Views = views, Readers = views };

    private static AnalyticsDay SiteDay(DateOnly day) => new()
    {
        Day = day,
        IsFinal = true,
        AggregatedAtUtc = day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc).AddDays(1).AddMinutes(30),
    };
}

/// <summary>The scenarios on the InMemory provider (a fresh database per test).</summary>
public sealed class ContentAnalyticsTests : ContentAnalyticsScenarios
{
    private readonly string _databaseName = Guid.NewGuid().ToString();

    protected override MktbaDbContext CreateContext()
        => new(new DbContextOptionsBuilder<MktbaDbContext>().UseInMemoryDatabase(_databaseName).Options);
}

/// <summary>The scenarios on PostgreSQL (<see cref="PostgresDatabaseFixture"/>).</summary>
public sealed class ContentAnalyticsPostgresTests : ContentAnalyticsScenarios, IClassFixture<PostgresDatabaseFixture>
{
    private readonly PostgresDatabaseFixture _database;

    public ContentAnalyticsPostgresTests(PostgresDatabaseFixture database)
    {
        _database = database;
    }

    protected override MktbaDbContext CreateContext() => _database.CreateContext();
}
