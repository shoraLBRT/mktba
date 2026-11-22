using AutoMapper;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Mappings;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;
using Mktba.Infrastructure.UnitOfWork;
using NSubstitute;

namespace Mktba.Application.Tests;

/// <summary>O-07 (#58): a removed article is Gone (410), a missing one Not Found (404); stubs and drafts are noindex.</summary>
public class ArticleResponseCodeTests : IDisposable
{
    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly ArticleService _articles;
    private readonly ArticleContentService _content;

    public ArticleResponseCodeTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        var articleRepo = new ArticleRepository(_context);
        var mapper = new MapperConfiguration(cfg => cfg.AddProfile<MappingProfile>(), NullLoggerFactory.Instance).CreateMapper();
        _articles = new ArticleService(articleRepo, mapper, TimeProvider.System, new RecordingSearchEngineNotifier());
        _content = new ArticleContentService(articleRepo, new ParagraphRepository(_context), Substitute.For<IUnitOfWork>(), new TagRepository(_context), new ArticleDraftRepository(_context), TimeProvider.System);
    }

    public void Dispose() => _context.Dispose();

    private async Task<Article> AddAsync(string slug, ArticleStatus status, bool everPublished, params string[] oldSlugs)
    {
        var article = new Article
        {
            Title = slug,
            Slug = slug,
            Status = status,
            PublishedAt = everPublished ? new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc) : null,
        };
        article.Paragraphs.Add(new Paragraph { Order = 1, Opinions = [new Opinion { Content = "Text", IsDefault = true }] });
        foreach (var oldSlug in oldSlugs)
        {
            article.SlugRedirects.Add(new ArticleSlugRedirect { Slug = oldSlug });
        }

        _context.Articles.Add(article);
        await _context.SaveChangesAsync();
        return article;
    }

    private async Task DeleteAsync(Article article)
    {
        await _articles.DeleteAsync(article.Id);
        _context.ChangeTracker.Clear();
    }

    private Task<ArticleSlugLookup> LookUpAnonymouslyAsync(string slug) => _content.GetContentBySlugAsync(slug, ArticleViewer.Anonymous);

    [Fact]
    public async Task GivenDeletedPublishedArticle_WhenItsSlugIsLookedUp_ThenThrowsGoneWithArticleGone()
    {
        var article = await AddAsync("namaz", ArticleStatus.Published, everPublished: true);
        await DeleteAsync(article);

        var lookup = () => LookUpAnonymouslyAsync("namaz");

        var failure = await lookup.Should().ThrowAsync<GoneException>();
        failure.Which.StatusCode.Should().Be(410);
        failure.Which.Error.Code.Should().Be("article_gone");
    }

    [Fact]
    public async Task GivenDeletedPublishedArticle_WhenOneOfItsOldSlugsIsLookedUp_ThenThrowsGone()
    {
        var article = await AddAsync("namaz", ArticleStatus.Published, everPublished: true, "salat");
        await DeleteAsync(article);

        var lookup = () => LookUpAnonymouslyAsync("salat");

        await lookup.Should().ThrowAsync<GoneException>();
        _context.DeletedArticleSlugs.Select(deleted => deleted.Slug).Should().BeEquivalentTo(["namaz", "salat"]);
    }

    [Fact]
    public async Task GivenDeletedNeverPublishedDraft_WhenItsSlugIsLookedUp_ThenThrowsNotFoundAndLeavesNoTombstone()
    {
        var article = await AddAsync("draft", ArticleStatus.Draft, everPublished: false);
        await DeleteAsync(article);

        var lookup = () => LookUpAnonymouslyAsync("draft");

        await lookup.Should().ThrowAsync<NotFoundException>();
        _context.DeletedArticleSlugs.Should().BeEmpty();
    }

    [Fact]
    public async Task GivenSlugDeletedTwice_WhenDeleting_ThenOneTombstoneIsKept()
    {
        await DeleteAsync(await AddAsync("namaz", ArticleStatus.Published, everPublished: true));
        await DeleteAsync(await AddAsync("namaz", ArticleStatus.Published, everPublished: true));

        _context.DeletedArticleSlugs.Should().ContainSingle();
        await FluentActions.Awaiting(() => LookUpAnonymouslyAsync("namaz")).Should().ThrowAsync<GoneException>();
    }

    [Fact]
    public async Task GivenSlugOfDeletedArticleTakenByNewArticle_WhenLookedUp_ThenReturnsTheNewArticle()
    {
        await DeleteAsync(await AddAsync("namaz", ArticleStatus.Published, everPublished: true));
        var reused = await AddAsync("namaz", ArticleStatus.Published, everPublished: true);

        var lookup = await LookUpAnonymouslyAsync("namaz");

        lookup.Content!.Id.Should().Be(reused.Id);
    }

    [Fact]
    public async Task GivenSlugOfDeletedArticleKeptAsOldSlugOfAnotherArticle_WhenLookedUp_ThenRedirectsToThatArticle()
    {
        await DeleteAsync(await AddAsync("namaz", ArticleStatus.Published, everPublished: true));
        await AddAsync("salat", ArticleStatus.Published, everPublished: true, "namaz");

        var lookup = await LookUpAnonymouslyAsync("namaz");

        lookup.RedirectToSlug.Should().Be("salat");
    }

    [Fact]
    public async Task GivenSlugOfDeletedArticleTakenByDraft_WhenLookedUpAnonymously_ThenThrowsNotFoundNotGone()
    {
        await DeleteAsync(await AddAsync("namaz", ArticleStatus.Published, everPublished: true));
        await AddAsync("namaz", ArticleStatus.Draft, everPublished: false);

        var lookup = () => LookUpAnonymouslyAsync("namaz");

        await lookup.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task GivenArchivedArticleThatWasPublished_WhenLookedUpAnonymouslyBySlugOldSlugOrId_ThenThrowsGone()
    {
        var article = await AddAsync("namaz", ArticleStatus.Archived, everPublished: true, "salat");

        await FluentActions.Awaiting(() => LookUpAnonymouslyAsync("namaz")).Should().ThrowAsync<GoneException>();
        await FluentActions.Awaiting(() => LookUpAnonymouslyAsync("salat")).Should().ThrowAsync<GoneException>();
        await FluentActions.Awaiting(() => _content.GetContentByArticleIdAsync(article.Id, ArticleViewer.Anonymous))
            .Should().ThrowAsync<GoneException>();
    }

    [Fact]
    public async Task GivenArchivedArticle_WhenAnEditorReadsIt_ThenReturnsContentWithNoIndex()
    {
        var article = await AddAsync("namaz", ArticleStatus.Archived, everPublished: true);

        var content = await _content.GetContentByArticleIdAsync(article.Id, TestViewers.Admin);

        content.Meta!.NoIndex.Should().BeTrue();
    }

    [Fact]
    public async Task GivenUnknownSlug_WhenLookedUp_ThenThrowsNotFound()
    {
        var lookup = () => LookUpAnonymouslyAsync("no-such-article");

        await lookup.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task GivenPublishedArticleWithContent_WhenRead_ThenItIsIndexable()
    {
        var article = await AddAsync("namaz", ArticleStatus.Published, everPublished: true);

        var content = await _content.GetContentByArticleIdAsync(article.Id, ArticleViewer.Anonymous);

        content.Meta!.NoIndex.Should().BeFalse();
    }

    [Fact]
    public async Task GivenPublishedStubWithoutContent_WhenRead_ThenItIsNoIndex()
    {
        var stub = new Article { Title = "Раздел", Slug = "razdel", Status = ArticleStatus.Published };
        _context.Articles.Add(stub);
        await _context.SaveChangesAsync();

        var content = await _content.GetContentByArticleIdAsync(stub.Id, ArticleViewer.Anonymous);

        content.Meta!.NoIndex.Should().BeTrue();
    }

    [Theory]
    [InlineData(ArticleStatus.Draft)]
    [InlineData(ArticleStatus.InReview)]
    public async Task GivenUnpublishedArticle_WhenAnEditorReadsIt_ThenItIsNoIndex(ArticleStatus status)
    {
        var article = await AddAsync("namaz", status, everPublished: false);

        var content = await _content.GetContentByArticleIdAsync(article.Id, TestViewers.Admin);

        content.Meta!.NoIndex.Should().BeTrue();
    }
}
