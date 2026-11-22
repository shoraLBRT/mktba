using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Mktba.Application.DTOs;
using Mktba.Application.Services.Analytics;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>
/// P-03 (#91): the author dashboard, read from the daily summaries and limited to the user's own
/// articles. The same scenarios run on the InMemory provider and on PostgreSQL.
/// </summary>
public abstract class AuthorAnalyticsScenarios : IAsyncLifetime
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
        context.AnalyticsAuthorDays.RemoveRange(await context.AnalyticsAuthorDays.ToListAsync());
        await context.SaveChangesAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task GetAsync_GivenNoSummaries_ReturnsEveryDayOfThePeriodEmpty()
    {
        var (author, _, _, _, _) = await SeedAsync();

        var result = await GetAsync(author, 3);

        result.From.Should().Be(Today.AddDays(-2));
        result.To.Should().Be(Today);
        result.Daily.Should().Equal(
            new AuthorAnalyticsDayDto(Today.AddDays(-2), 0, 0),
            new AuthorAnalyticsDayDto(Today.AddDays(-1), 0, 0),
            new AuthorAnalyticsDayDto(Today, 0, 0));
        result.Totals.Should().Be(new AuthorAnalyticsTotalsDto(0, 0, 0));
        result.TopArticles.Should().BeEmpty();
        result.Depth.Should().Be(new ReadDepthDto(0, 0, 0, 0, 0));
        result.Schools.Should().BeEmpty();
        result.ViewsWithoutSchool.Should().Be(0);
        result.AggregatedAtUtc.Should().BeNull();
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(-5, 1)]
    [InlineData(1000, AuthorAnalyticsService.MaxDays)]
    public async Task GetAsync_GivenDaysOutOfRange_KeepsThemWithinOneToTheMaximum(int days, int expected)
    {
        var (author, _, _, _, _) = await SeedAsync();

        var result = await GetAsync(author, days);

        result.Days.Should().Be(expected);
        result.Daily.Should().HaveCount(expected);
        result.Daily[^1].Day.Should().Be(Today);
    }

    [Fact]
    public async Task GetAsync_GivenSummariesOfSeveralAuthors_ReturnsOnlyTheUsersOwnArticlesOverThePeriod()
    {
        var (author, other, written, coWritten, othersArticle) = await SeedAsync();
        var school = await SeedSchoolAsync();
        await using (var context = CreateContext())
        {
            context.AnalyticsDays.AddRange(
                SiteDay(Today.AddDays(-1)),
                SiteDay(Today));
            context.AnalyticsAuthorDays.AddRange(
                new AnalyticsAuthorDay { Day = Today.AddDays(-7), UserId = author, Views = 100, Readers = 50, Articles = 1 },
                new AnalyticsAuthorDay { Day = Today.AddDays(-1), UserId = author, Views = 6, Readers = 3, Articles = 2 },
                new AnalyticsAuthorDay { Day = Today, UserId = author, Views = 4, Readers = 2, Articles = 1 },
                new AnalyticsAuthorDay { Day = Today, UserId = other, Views = 40, Readers = 20, Articles = 1 });
            context.AnalyticsArticleDays.AddRange(
                ArticleDay(Today.AddDays(-7), written, views: 100, depth: [90, 80, 70, 60]),
                ArticleDay(Today.AddDays(-1), written, views: 4, depth: [4, 3, 2, 1]),
                ArticleDay(Today, written, views: 3, depth: [3, 2, 1, 1]),
                ArticleDay(Today.AddDays(-1), coWritten, views: 2, depth: [2, 1, 0, 0]),
                ArticleDay(Today, othersArticle, views: 40, depth: [40, 40, 40, 40]));
            context.AnalyticsArticleSchoolDays.AddRange(
                new AnalyticsArticleSchoolDay { Day = Today.AddDays(-7), ArticleId = written, SchoolId = school, Views = 60, Readers = 30 },
                new AnalyticsArticleSchoolDay { Day = Today.AddDays(-1), ArticleId = written, SchoolId = school, Views = 3, Readers = 2 },
                new AnalyticsArticleSchoolDay { Day = Today, ArticleId = coWritten, SchoolId = school, Views = 1, Readers = 1 },
                new AnalyticsArticleSchoolDay { Day = Today, ArticleId = othersArticle, SchoolId = school, Views = 30, Readers = 15 },
                new AnalyticsArticleSchoolDay { Day = Today, ArticleId = othersArticle, SchoolId = 987_654, Views = 5, Readers = 5 });
            await context.SaveChangesAsync();
        }

        var result = await GetAsync(author, 2);

        result.Daily.Should().Equal(
            new AuthorAnalyticsDayDto(Today.AddDays(-1), 6, 3),
            new AuthorAnalyticsDayDto(Today, 4, 2));
        result.Totals.Should().Be(new AuthorAnalyticsTotalsDto(10, 5, 2));
        result.TopArticles.Should().BeEquivalentTo(
            new[]
            {
                new AuthorArticleTotalDto(written, "Своя", "own-" + _key, 7, 7, new ReadDepthDto(7, 7, 5, 3, 2)),
                new AuthorArticleTotalDto(coWritten, "Совместная", "shared-" + _key, 2, 2, new ReadDepthDto(2, 2, 1, 0, 0)),
            },
            options => options.WithStrictOrdering());
        result.Depth.Should().Be(new ReadDepthDto(9, 9, 6, 3, 2));
        result.Schools.Should().Equal(new AnalyticsSchoolTotalDto(school, "Школа " + _key, 4, 3));
        result.ViewsWithoutSchool.Should().Be(5);
        result.AggregatedAtUtc.Should().Be(Now.AddHours(-1));
    }

    [Fact]
    public async Task GetAsync_GivenMoreArticlesThanTheTop_ReturnsTheMostViewedOnes()
    {
        var (author, _, _, _, _) = await SeedAsync();
        var many = new List<int>();
        await using (var context = CreateContext())
        {
            for (var index = 0; index < AuthorAnalyticsService.TopArticleCount + 2; index++)
            {
                var article = new Article { Title = $"Статья {index}", Slug = $"many-{index}-{_key}", Status = ArticleStatus.Published, AuthorId = author };
                context.Articles.Add(article);
                await context.SaveChangesAsync();
                many.Add(article.Id);
            }

            context.AnalyticsArticleDays.AddRange(many.Select((id, index) => ArticleDay(Today, id, views: index + 1, depth: [0, 0, 0, 0])));
            await context.SaveChangesAsync();
        }

        var result = await GetAsync(author, 1);

        result.TopArticles.Should().HaveCount(AuthorAnalyticsService.TopArticleCount);
        result.TopArticles[0].Views.Should().Be(AuthorAnalyticsService.TopArticleCount + 2);
        result.TopArticles[^1].Views.Should().Be(3);
        result.Totals.ArticlesViewed.Should().Be(AuthorAnalyticsService.TopArticleCount + 2);
        result.Depth.Views.Should().Be(many.Count * (many.Count + 1) / 2);
    }

    private async Task<AuthorAnalyticsDto> GetAsync(int userId, int days)
    {
        await using var context = CreateContext();
        return await new AuthorAnalyticsService(new AnalyticsSummaryRepository(context), new FeedbackTests.FakeClock(Now))
            .GetAsync(userId, days);
    }

    /// <summary>The author, another author, the author's article, one the author co-writes and one of the other author's.</summary>
    private async Task<(int Author, int Other, int Written, int CoWritten, int OthersArticle)> SeedAsync()
    {
        await using var context = CreateContext();
        var author = new User { Email = $"author-{_key}@mktba.test", PasswordHash = "hash", Role = UserRole.Author };
        var other = new User { Email = $"other-{_key}@mktba.test", PasswordHash = "hash", Role = UserRole.Author };
        context.Users.AddRange(author, other);
        await context.SaveChangesAsync();

        var written = new Article { Title = "Своя", Slug = "own-" + _key, Status = ArticleStatus.Published, AuthorId = author.Id };
        var coWritten = new Article { Title = "Совместная", Slug = "shared-" + _key, Status = ArticleStatus.Published, AuthorId = other.Id };
        coWritten.CoAuthors.Add(new ArticleCoAuthor { UserId = author.Id });
        var othersArticle = new Article { Title = "Чужая", Slug = "others-" + _key, Status = ArticleStatus.Published, AuthorId = other.Id };
        context.Articles.AddRange(written, coWritten, othersArticle);
        await context.SaveChangesAsync();
        return (author.Id, other.Id, written.Id, coWritten.Id, othersArticle.Id);
    }

    private async Task<int> SeedSchoolAsync()
    {
        await using var context = CreateContext();
        var school = new School { Name = "Школа " + _key, ShortName = "Ш", Slug = "school-" + _key };
        context.Schools.Add(school);
        await context.SaveChangesAsync();
        return school.Id;
    }

    private static AnalyticsDay SiteDay(DateOnly day) => new()
    {
        Day = day,
        ArticleViews = 1,
        Visitors = 1,
        IsFinal = day < Today,
        AggregatedAtUtc = day == Today ? Now.AddHours(-1) : day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc).AddDays(1).AddMinutes(30),
    };

    // Readers = views keeps the scenarios short.
    private static AnalyticsArticleDay ArticleDay(DateOnly day, int articleId, int views, int[] depth) => new()
    {
        Day = day,
        ArticleId = articleId,
        Views = views,
        Readers = views,
        ReachedDepth25 = depth[0],
        ReachedDepth50 = depth[1],
        ReachedDepth75 = depth[2],
        ReachedDepth100 = depth[3],
    };
}

/// <summary>The scenarios on the InMemory provider (a fresh database per test).</summary>
public sealed class AuthorAnalyticsTests : AuthorAnalyticsScenarios
{
    private readonly string _databaseName = Guid.NewGuid().ToString();

    protected override MktbaDbContext CreateContext()
        => new(new DbContextOptionsBuilder<MktbaDbContext>().UseInMemoryDatabase(_databaseName).Options);
}

/// <summary>The scenarios on PostgreSQL (<see cref="PostgresDatabaseFixture"/>).</summary>
public sealed class AuthorAnalyticsPostgresTests : AuthorAnalyticsScenarios, IClassFixture<PostgresDatabaseFixture>
{
    private readonly PostgresDatabaseFixture _database;

    public AuthorAnalyticsPostgresTests(PostgresDatabaseFixture database)
    {
        _database = database;
    }

    protected override MktbaDbContext CreateContext() => _database.CreateContext();
}
