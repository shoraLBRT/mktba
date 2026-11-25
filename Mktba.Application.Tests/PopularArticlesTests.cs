using FluentAssertions;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>R-05 (#41): which articles the home page lists as popular, from the daily view summaries.</summary>
public class PopularArticlesTests : IDisposable
{
    private static readonly DateOnly Today = new(2026, 11, 20);
    private static readonly DateTime Now = Today.ToDateTime(new TimeOnly(15, 0), DateTimeKind.Utc);

    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly PopularArticlesService _service;

    public PopularArticlesTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        _service = new PopularArticlesService(
            new ArticleRepository(_context),
            new AnalyticsSummaryRepository(_context),
            new FeedbackTests.FakeClock(Now));
    }

    public void Dispose() => _context.Dispose();

    /// <summary>A Published article with content (a summary), published <paramref name="publishedDaysAgo"/> days ago.</summary>
    private static Article Published(string slug, int publishedDaysAgo = 60, Article? parent = null) =>
        new()
        {
            Title = slug,
            Slug = slug,
            Status = ArticleStatus.Published,
            ParentArticle = parent,
            Summary = "Text",
            PublishedAt = Now.AddDays(-publishedDaysAgo),
            UpdatedAt = Now.AddDays(-publishedDaysAgo),
        };

    private void Viewed(Article article, int daysAgo, int views)
        => _context.AnalyticsArticleDays.Add(new AnalyticsArticleDay { ArticleId = article.Id, Day = Today.AddDays(-daysAgo), Views = views, Readers = views });

    private async Task<List<string>> PopularSlugsAsync(string? locale = null, int limit = PopularArticlesService.DefaultLimit)
        => (await _service.GetAsync(locale, limit)).Items.Select(article => article.Slug).ToList();

    [Fact]
    public async Task GivenNoViews_WhenListing_ThenTheListIsEmptyForTheWindow()
    {
        _context.Articles.Add(Published("unread"));
        await _context.SaveChangesAsync();

        var popular = await _service.GetAsync(null, PopularArticlesService.DefaultLimit);

        popular.Days.Should().Be(30);
        popular.Items.Should().BeEmpty();
    }

    [Fact]
    public async Task GivenViewsOverSeveralDays_WhenListing_ThenMostViewedInTheLast30DaysComeFirst()
    {
        var steady = Published("steady");
        var burst = Published("burst");
        var old = Published("old");
        var unread = Published("unread");
        _context.Articles.AddRange(steady, burst, old, unread);
        await _context.SaveChangesAsync();
        Viewed(steady, daysAgo: 0, views: 4);
        Viewed(steady, daysAgo: 29, views: 4);
        Viewed(burst, daysAgo: 1, views: 6);
        // Before the window: does not count.
        Viewed(old, daysAgo: 30, views: 100);
        await _context.SaveChangesAsync();

        var popular = await _service.GetAsync(null, PopularArticlesService.DefaultLimit);

        popular.Items.Select(article => article.Slug).Should().Equal("steady", "burst");
        var entry = popular.Items[0];
        entry.Id.Should().Be(steady.Id);
        entry.Title.Should().Be("steady");
        entry.Summary.Should().Be("Text");
    }

    [Fact]
    public async Task GivenEqualViews_WhenListing_ThenTheNewerPublicationComesFirst()
    {
        var older = Published("older", publishedDaysAgo: 90);
        var newer = Published("newer", publishedDaysAgo: 10);
        _context.Articles.AddRange(older, newer);
        await _context.SaveChangesAsync();
        Viewed(older, daysAgo: 2, views: 3);
        Viewed(newer, daysAgo: 2, views: 3);
        await _context.SaveChangesAsync();

        (await PopularSlugsAsync()).Should().Equal("newer", "older");
    }

    [Theory]
    [InlineData(ArticleStatus.Draft)]
    [InlineData(ArticleStatus.InReview)]
    [InlineData(ArticleStatus.Archived)]
    public async Task GivenViewedArticleNoLongerPublished_WhenListing_ThenItIsLeftOut(ArticleStatus status)
    {
        var hidden = Published("hidden");
        hidden.Status = status;
        var visible = Published("visible");
        _context.Articles.AddRange(hidden, visible);
        await _context.SaveChangesAsync();
        Viewed(hidden, daysAgo: 1, views: 50);
        Viewed(visible, daysAgo: 1, views: 1);
        await _context.SaveChangesAsync();

        (await PopularSlugsAsync()).Should().Equal("visible");
    }

    [Fact]
    public async Task GivenViewedArticleInTheTrash_WhenListing_ThenItIsLeftOut()
    {
        var trashed = Published("trashed");
        trashed.DeletedAt = Now.AddDays(-1);
        var visible = Published("visible");
        _context.Articles.AddRange(trashed, visible);
        await _context.SaveChangesAsync();
        Viewed(trashed, daysAgo: 2, views: 50);
        Viewed(visible, daysAgo: 2, views: 1);
        await _context.SaveChangesAsync();

        (await PopularSlugsAsync()).Should().Equal("visible");
    }

    [Fact]
    public async Task GivenViewedArticleUnderDraftParent_WhenListing_ThenItIsLeftOut()
    {
        var draft = new Article { Title = "draft", Slug = "draft", Status = ArticleStatus.Draft };
        var child = Published("child", parent: draft);
        var root = Published("root");
        _context.Articles.AddRange(draft, child, root);
        await _context.SaveChangesAsync();
        Viewed(child, daysAgo: 1, views: 50);
        Viewed(root, daysAgo: 1, views: 1);
        await _context.SaveChangesAsync();

        (await PopularSlugsAsync()).Should().Equal("root");
    }

    [Fact]
    public async Task GivenViewedStubWithoutContent_WhenListing_ThenItIsLeftOut()
    {
        var stub = Published("stub");
        stub.Summary = null;
        var full = Published("full");
        _context.Articles.AddRange(stub, full);
        await _context.SaveChangesAsync();
        Viewed(stub, daysAgo: 1, views: 50);
        Viewed(full, daysAgo: 1, views: 1);
        await _context.SaveChangesAsync();

        (await PopularSlugsAsync()).Should().Equal("full");
    }

    [Fact]
    public async Task GivenViewedArticlesInTwoLanguages_WhenListing_ThenOnlyTheRequestedLanguageIsListed()
    {
        var english = Published("prayer");
        english.Locale = "en";
        var russian = Published("namaz");
        _context.Articles.AddRange(russian, english);
        await _context.SaveChangesAsync();
        Viewed(russian, daysAgo: 1, views: 1);
        Viewed(english, daysAgo: 1, views: 5);
        await _context.SaveChangesAsync();

        (await PopularSlugsAsync()).Should().Equal("namaz");
        (await PopularSlugsAsync("en")).Should().Equal("prayer");
    }

    [Fact]
    public async Task GivenUnsupportedLocale_WhenListing_ThenLocaleUnsupportedIsThrown()
    {
        var act = () => _service.GetAsync("xx", 6);

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("locale_unsupported");
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(2, 2)]
    [InlineData(500, PopularArticlesService.MaxLimit)]
    public async Task GivenLimit_WhenListing_ThenItIsKeptWithinBounds(int limit, int expected)
    {
        var articles = Enumerable.Range(1, PopularArticlesService.MaxLimit + 5).Select(i => Published($"a{i}")).ToList();
        _context.Articles.AddRange(articles);
        await _context.SaveChangesAsync();
        foreach (var (article, index) in articles.Select((article, index) => (article, index)))
        {
            Viewed(article, daysAgo: 1, views: index + 1);
        }

        await _context.SaveChangesAsync();

        (await PopularSlugsAsync(limit: limit)).Should().HaveCount(expected);
    }
}
