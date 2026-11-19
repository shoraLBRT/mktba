using FluentAssertions;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>R-05 (#41): which articles the home page lists as new and as updated.</summary>
public class RecentArticlesTests : IDisposable
{
    private static readonly DateTime Day = new(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc);

    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly RecentArticlesService _service;

    public RecentArticlesTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        _service = new RecentArticlesService(new ArticleRepository(_context));
    }

    public void Dispose() => _context.Dispose();

    /// <summary>
    /// A Published article with content (a summary), published on day <paramref name="publishedDay"/>
    /// and last saved on day <paramref name="updatedDay"/> (by default the day before publication).
    /// </summary>
    private static Article Published(string slug, int publishedDay, int? updatedDay = null, Article? parent = null) =>
        new()
        {
            Title = slug,
            Slug = slug,
            Status = ArticleStatus.Published,
            ParentArticle = parent,
            Summary = "Text",
            PublishedAt = Day.AddDays(publishedDay),
            UpdatedAt = Day.AddDays(updatedDay ?? publishedDay - 1),
        };

    [Fact]
    public async Task GivenPublishedArticles_WhenListing_ThenNewIsOrderedByPublicationNewestFirst()
    {
        _context.Articles.AddRange(Published("old", 1), Published("newest", 3), Published("middle", 2));
        await _context.SaveChangesAsync();

        var recent = await _service.GetAsync(null, RecentArticlesService.DefaultLimit);

        recent.New.Select(article => article.Slug).Should().Equal("newest", "middle", "old");
        var entry = recent.New[0];
        entry.Title.Should().Be("newest");
        entry.Summary.Should().Be("Text");
        entry.PublishedAt.Should().Be(Day.AddDays(3));
        entry.UpdatedAt.Should().Be(Day.AddDays(2));
    }

    [Fact]
    public async Task GivenArticlesSavedAfterPublication_WhenListing_ThenUpdatedHoldsOnlyThemLatestSaveFirst()
    {
        _context.Articles.AddRange(
            Published("untouched", 5),
            Published("edited-earlier", 1, updatedDay: 6),
            Published("edited-later", 2, updatedDay: 7));
        await _context.SaveChangesAsync();

        var recent = await _service.GetAsync(null, RecentArticlesService.DefaultLimit);

        recent.Updated.Select(article => article.Slug).Should().Equal("edited-later", "edited-earlier");
        recent.New.Select(article => article.Slug).Should().Equal("untouched", "edited-later", "edited-earlier");
    }

    [Theory]
    [InlineData(ArticleStatus.Draft)]
    [InlineData(ArticleStatus.InReview)]
    [InlineData(ArticleStatus.Archived)]
    public async Task GivenNonPublishedArticle_WhenListing_ThenItIsInNeitherList(ArticleStatus status)
    {
        var hidden = Published("hidden", 2, updatedDay: 9);
        hidden.Status = status;
        _context.Articles.AddRange(Published("visible", 1, updatedDay: 8), hidden);
        await _context.SaveChangesAsync();

        var recent = await _service.GetAsync(null, RecentArticlesService.DefaultLimit);

        recent.New.Select(article => article.Slug).Should().Equal("visible");
        recent.Updated.Select(article => article.Slug).Should().Equal("visible");
    }

    [Fact]
    public async Task GivenPublishedArticleUnderDraftParent_WhenListing_ThenTheWholeHiddenSubtreeIsLeftOut()
    {
        var draft = new Article { Title = "draft", Slug = "draft", Status = ArticleStatus.Draft };
        var child = Published("child", 2, parent: draft);
        _context.Articles.AddRange(draft, child, Published("grandchild", 3, parent: child), Published("root", 1));
        await _context.SaveChangesAsync();

        var recent = await _service.GetAsync(null, RecentArticlesService.DefaultLimit);

        recent.New.Select(article => article.Slug).Should().Equal("root");
    }

    [Fact]
    public async Task GivenPublishedStubWithoutContent_WhenListing_ThenItIsLeftOutButItsChildrenAreListed()
    {
        var stub = Published("stub", 2);
        stub.Summary = null;
        _context.Articles.AddRange(stub, Published("child", 1, parent: stub));
        await _context.SaveChangesAsync();

        var recent = await _service.GetAsync(null, RecentArticlesService.DefaultLimit);

        recent.New.Select(article => article.Slug).Should().Equal("child");
    }

    [Fact]
    public async Task GivenArticlesInTwoLanguages_WhenListing_ThenOnlyTheRequestedLanguageIsListed()
    {
        var english = Published("prayer", 2);
        english.Locale = "en";
        _context.Articles.AddRange(Published("namaz", 1), english);
        await _context.SaveChangesAsync();

        (await _service.GetAsync(null, 6)).New.Select(article => article.Slug).Should().Equal("namaz");
        (await _service.GetAsync("en", 6)).New.Select(article => article.Slug).Should().Equal("prayer");
    }

    [Fact]
    public async Task GivenUnsupportedLocale_WhenListing_ThenLocaleUnsupportedIsThrown()
    {
        var act = () => _service.GetAsync("xx", 6);

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("locale_unsupported");
    }

    [Theory]
    [InlineData(2, 2)]
    [InlineData(0, 1)]
    [InlineData(500, RecentArticlesService.MaxLimit)]
    public async Task GivenMoreArticlesThanTheLimit_WhenListing_ThenEachListIsCutToTheLimitKeptInRange(int limit, int expected)
    {
        _context.Articles.AddRange(Enumerable.Range(1, RecentArticlesService.MaxLimit + 5)
            .Select(day => Published($"article-{day}", day, updatedDay: day + 100)));
        await _context.SaveChangesAsync();

        var recent = await _service.GetAsync(null, limit);

        recent.New.Should().HaveCount(expected);
        recent.Updated.Should().HaveCount(expected);
    }
}
