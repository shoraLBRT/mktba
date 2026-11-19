using FluentAssertions;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>O-06 (#57): which articles the sitemap lists.</summary>
public class SitemapTests : IDisposable
{
    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly SitemapService _service;

    public SitemapTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        _service = new SitemapService(new ArticleRepository(_context));
    }

    public void Dispose() => _context.Dispose();

    /// <summary>A Published article with content (a summary), so it is not a stub.</summary>
    private static Article Published(string slug, Article? parent = null) =>
        new() { Title = slug, Slug = slug, Status = ArticleStatus.Published, ParentArticle = parent, Summary = "Text" };

    [Fact]
    public async Task GivenPublishedArticle_WhenListing_ThenItIsListedWithLocaleGroupAndLastModified()
    {
        var updatedAt = new DateTime(2026, 11, 1, 10, 30, 0, DateTimeKind.Utc);
        var article = Published("namaz");
        article.UpdatedAt = updatedAt;
        _context.Articles.Add(article);
        await _context.SaveChangesAsync();

        var articles = await _service.GetArticlesAsync();

        var entry = articles.Should().ContainSingle().Subject;
        entry.Slug.Should().Be("namaz");
        entry.Locale.Should().Be(Locales.Default);
        entry.TranslationGroupId.Should().Be(article.TranslationGroupId);
        entry.LastModified.Should().Be(updatedAt);
    }

    [Theory]
    [InlineData(ArticleStatus.Draft)]
    [InlineData(ArticleStatus.InReview)]
    [InlineData(ArticleStatus.Archived)]
    public async Task GivenNonPublishedArticle_WhenListing_ThenItIsLeftOut(ArticleStatus status)
    {
        _context.Articles.AddRange(Published("visible"), new Article { Title = "hidden", Slug = "hidden", Status = status });
        await _context.SaveChangesAsync();

        var articles = await _service.GetArticlesAsync();

        articles.Select(article => article.Slug).Should().Equal("visible");
    }

    [Fact]
    public async Task GivenPublishedArticleUnderDraftParent_WhenListing_ThenTheWholeHiddenSubtreeIsLeftOut()
    {
        var draft = new Article { Title = "draft", Slug = "draft", Status = ArticleStatus.Draft };
        var child = Published("child", draft);
        _context.Articles.AddRange(draft, child, Published("grandchild", child), Published("root"));
        await _context.SaveChangesAsync();

        var articles = await _service.GetArticlesAsync();

        articles.Select(article => article.Slug).Should().Equal("root");
    }

    [Fact]
    public async Task GivenNoIndexArticle_WhenListing_ThenItIsLeftOutButItsChildrenAreListed()
    {
        var parent = Published("parent");
        parent.NoIndex = true;
        _context.Articles.AddRange(parent, Published("child", parent));
        await _context.SaveChangesAsync();

        var articles = await _service.GetArticlesAsync();

        articles.Select(article => article.Slug).Should().Equal("child");
    }

    [Fact]
    public async Task GivenPublishedTranslation_WhenListing_ThenBothLanguageVersionsShareTheGroup()
    {
        var original = Published("namaz");
        var translation = Published("prayer");
        translation.Locale = "en";
        translation.TranslationGroupId = original.TranslationGroupId;
        _context.Articles.AddRange(original, translation);
        await _context.SaveChangesAsync();

        var articles = await _service.GetArticlesAsync();

        articles.Select(article => (article.Locale, article.Slug)).Should().Equal(("ru", "namaz"), ("en", "prayer"));
        articles.Select(article => article.TranslationGroupId).Distinct().Should().ContainSingle();
    }

    [Fact]
    public async Task GivenEmptyDatabase_WhenListing_ThenReturnsEmptyList()
    {
        var articles = await _service.GetArticlesAsync();

        articles.Should().BeEmpty();
    }

    [Fact]
    public async Task GivenPublishedStubWithoutContent_WhenListing_ThenItIsLeftOutButItsChildIsListed()
    {
        var stub = new Article { Title = "stub", Slug = "stub", Status = ArticleStatus.Published };
        _context.Articles.AddRange(stub, Published("child", stub));
        await _context.SaveChangesAsync();

        var articles = await _service.GetArticlesAsync();

        articles.Select(article => article.Slug).Should().Equal("child");
    }

    [Fact]
    public async Task GivenArticleWithOnlyAnOpinion_WhenListing_ThenItIsListed()
    {
        var article = new Article { Title = "namaz", Slug = "namaz", Status = ArticleStatus.Published };
        article.Paragraphs.Add(new Paragraph { Order = 1, Opinions = [new Opinion { Content = "Text", IsDefault = true }] });
        _context.Articles.Add(article);
        await _context.SaveChangesAsync();

        var articles = await _service.GetArticlesAsync();

        articles.Select(entry => entry.Slug).Should().Equal("namaz");
    }
}
