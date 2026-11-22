using AutoMapper;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
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

/// <summary>M-11 (#133): an article goes to the trash first; an admin restores it or purges it for good.</summary>
public class ArticleTrashTests : IDisposable
{
    private static readonly DateTime Now = new(2026, 11, 22, 12, 0, 0, DateTimeKind.Utc);

    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly ArticleService _articles;
    private readonly ArticleContentService _content;
    private readonly NavigationTreeService _tree;
    private readonly RecordingSearchEngineNotifier _searchEngines = new();

    public ArticleTrashTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        var articleRepo = new ArticleRepository(_context);
        var mapper = new MapperConfiguration(cfg => cfg.AddProfile<MappingProfile>(), NullLoggerFactory.Instance).CreateMapper();
        _articles = new ArticleService(articleRepo, mapper, new FeedbackTests.FakeClock(Now), _searchEngines);
        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync().Returns(_ => _context.SaveChangesAsync());
        _content = new ArticleContentService(articleRepo, new ParagraphRepository(_context), uow, new TagRepository(_context), new ArticleDraftRepository(_context), TimeProvider.System);
        _tree = new NavigationTreeService(articleRepo);
    }

    public void Dispose() => _context.Dispose();

    [Fact]
    public async Task GivenPublishedArticle_WhenTrashed_ThenItLeavesTheSiteAndItsSlugAnswersGone()
    {
        var article = await AddAsync("namaz", ArticleStatus.Published, everPublished: true);
        var user = new User { Email = "admin@example.org", DisplayName = "Админ" };
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        await _articles.MoveToTrashAsync(article.Id, user.Id);
        _context.ChangeTracker.Clear();

        (await _articles.GetAllAsync(TestViewers.Admin)).Should().BeEmpty();
        (await _tree.GetTreeAsync(TestViewers.Admin)).Should().BeEmpty();
        var lookup = () => _content.GetContentBySlugAsync("namaz", ArticleViewer.Anonymous);
        (await lookup.Should().ThrowAsync<GoneException>()).Which.Error.Code.Should().Be("article_gone");
        var byId = () => _content.GetContentByArticleIdAsync(article.Id, TestViewers.Admin);
        await byId.Should().ThrowAsync<NotFoundException>();
        _searchEngines.Slugs.Should().Equal("namaz");

        var trash = await _articles.GetTrashAsync();
        trash.Should().ContainSingle();
        trash[0].Should().BeEquivalentTo(new
        {
            article.Id,
            Slug = "namaz",
            Status = ArticleStatus.Published,
            DeletedAt = Now,
            DeletedByDisplayName = "Админ",
            ParentArticleId = (int?)null,
            ParentInTrash = false,
        });
    }

    [Fact]
    public async Task GivenPublishedEnglishArticle_WhenTrashed_ThenItsSlugAnswersGoneInEnglishOnly()
    {
        var article = await AddAsync("prayer", ArticleStatus.Published, everPublished: true);
        article.Locale = "en";
        await _context.SaveChangesAsync();

        await _articles.MoveToTrashAsync(article.Id, deletedById: null);
        _context.ChangeTracker.Clear();

        var english = () => _content.GetContentBySlugAsync("prayer", ArticleViewer.Anonymous, "en");
        var russian = () => _content.GetContentBySlugAsync("prayer", ArticleViewer.Anonymous, "ru");
        await english.Should().ThrowAsync<GoneException>();
        await russian.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task GivenNeverPublishedDraft_WhenTrashed_ThenItsSlugIsNotFound()
    {
        var article = await AddAsync("chernovik", ArticleStatus.Draft, everPublished: false);

        await _articles.MoveToTrashAsync(article.Id, deletedById: null);
        _context.ChangeTracker.Clear();

        var lookup = () => _content.GetContentBySlugAsync("chernovik", TestViewers.Admin);
        await lookup.Should().ThrowAsync<NotFoundException>();
        _searchEngines.Slugs.Should().BeEmpty();
    }

    [Fact]
    public async Task GivenTrashedArticle_WhenTrashedAgain_ThenNotFound()
    {
        var article = await AddAsync("namaz", ArticleStatus.Draft, everPublished: false);
        await _articles.MoveToTrashAsync(article.Id, deletedById: null);

        var again = () => _articles.MoveToTrashAsync(article.Id, deletedById: null);

        (await again.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("article_not_found");
    }

    [Fact]
    public async Task GivenSectionWithChildren_WhenTrashed_ThenRefusedWithArticleHasChildren()
    {
        var parent = await AddAsync("razdel", ArticleStatus.Published, everPublished: true);
        await AddAsync("statya", ArticleStatus.Published, everPublished: true, parent.Id);

        var trash = () => _articles.MoveToTrashAsync(parent.Id, deletedById: null);

        (await trash.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_has_children");
        _context.ChangeTracker.Clear();
        (await _context.Articles.CountAsync()).Should().Be(2);
    }

    [Fact]
    public async Task GivenSectionWhoseOnlyChildIsTrashed_WhenTrashed_ThenItGoesToo()
    {
        var parent = await AddAsync("razdel", ArticleStatus.Published, everPublished: true);
        var child = await AddAsync("statya", ArticleStatus.Published, everPublished: true, parent.Id);
        await _articles.MoveToTrashAsync(child.Id, deletedById: null);

        await _articles.MoveToTrashAsync(parent.Id, deletedById: null);

        (await _articles.GetTrashAsync()).Single(item => item.Id == child.Id).ParentInTrash.Should().BeTrue();
    }

    [Fact]
    public async Task GivenSiblings_WhenTheMiddleOneIsTrashedAndRestored_ThenOrderStaysContiguousAndItComesBackLast()
    {
        var parent = await AddAsync("razdel", ArticleStatus.Published, everPublished: true);
        var a = await AddAsync("a", ArticleStatus.Published, everPublished: true, parent.Id, order: 0);
        var b = await AddAsync("b", ArticleStatus.Published, everPublished: true, parent.Id, order: 1);
        var c = await AddAsync("c", ArticleStatus.Published, everPublished: true, parent.Id, order: 2);

        await _articles.MoveToTrashAsync(b.Id, deletedById: null);
        _context.ChangeTracker.Clear();
        OrdersUnder(parent.Id).Should().Equal((a.Id, 0), (c.Id, 1));

        await _articles.RestoreAsync(b.Id);
        _context.ChangeTracker.Clear();

        OrdersUnder(parent.Id).Should().Equal((a.Id, 0), (c.Id, 1), (b.Id, 2));
        var restored = await _context.Articles.SingleAsync(article => article.Id == b.Id);
        restored.DeletedAt.Should().BeNull();
        restored.DeletedById.Should().BeNull();
        restored.Status.Should().Be(ArticleStatus.Published);
        (await _content.GetContentBySlugAsync("b", ArticleViewer.Anonymous)).Content!.Id.Should().Be(b.Id);
        (await _articles.GetTrashAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task GivenTrashedArticle_WhenAnotherArticleWantsItsSlug_ThenTheSlugStaysReserved()
    {
        var article = await AddAsync("namaz", ArticleStatus.Published, everPublished: true);
        await _articles.MoveToTrashAsync(article.Id, deletedById: null);

        var taken = () => _content.CreateArticleWithContentAsync(
            new ArticleContentCreateDto("Намаз", null,
                [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
                null, null, null, null, Slug: "namaz"), null);

        (await taken.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_slug_taken");
    }

    [Fact]
    public async Task GivenTrashedSection_WhenAnArticleIsCreatedUnderIt_ThenRefusedWithParentNotFound()
    {
        var parent = await AddAsync("razdel", ArticleStatus.Published, everPublished: true);
        await _articles.MoveToTrashAsync(parent.Id, deletedById: null);

        var create = () => _articles.CreateAsync(new ArticleCreateDto { Title = "Дочерняя", ParentArticleId = parent.Id }, null);

        (await create.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_parent_not_found");
    }

    [Fact]
    public async Task GivenChildWhoseParentIsTrashed_WhenRestored_ThenRefusedUntilTheParentIsBack()
    {
        var parent = await AddAsync("razdel", ArticleStatus.Published, everPublished: true);
        var child = await AddAsync("statya", ArticleStatus.Published, everPublished: true, parent.Id);
        await _articles.MoveToTrashAsync(child.Id, deletedById: null);
        await _articles.MoveToTrashAsync(parent.Id, deletedById: null);

        var restoreChild = () => _articles.RestoreAsync(child.Id);
        (await restoreChild.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_parent_in_trash");

        await _articles.RestoreAsync(parent.Id);
        await _articles.RestoreAsync(child.Id);
        _context.ChangeTracker.Clear();
        OrdersUnder(parent.Id).Should().Equal((child.Id, 0));
    }

    [Fact]
    public async Task GivenArticleOutsideTheTrash_WhenRestoredOrPurged_ThenNotInTrash()
    {
        var article = await AddAsync("namaz", ArticleStatus.Published, everPublished: true);

        var restore = () => _articles.RestoreAsync(article.Id);
        var purge = () => _articles.PurgeAsync(article.Id);

        (await restore.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("article_not_in_trash");
        (await purge.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("article_not_in_trash");
        (await _context.Articles.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task GivenTrashedPublishedArticle_WhenPurged_ThenItIsGoneForGoodAndItsSlugsAreTombstoned()
    {
        var article = await AddAsync("namaz", ArticleStatus.Published, everPublished: true, oldSlug: "salat");
        await _articles.MoveToTrashAsync(article.Id, deletedById: null);

        await _articles.PurgeAsync(article.Id);
        _context.ChangeTracker.Clear();

        (await _context.Articles.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await _context.Paragraphs.CountAsync()).Should().Be(0);
        (await _articles.GetTrashAsync()).Should().BeEmpty();
        _context.DeletedArticleSlugs.Select(deleted => deleted.Slug).Should().BeEquivalentTo(["namaz", "salat"]);
        var lookup = () => _content.GetContentBySlugAsync("salat", ArticleViewer.Anonymous);
        await lookup.Should().ThrowAsync<GoneException>();
    }

    [Fact]
    public async Task GivenTrashedSectionWithATrashedChild_WhenTheSectionIsPurged_ThenTheChildMovesToTheRootAndCanBeRestored()
    {
        var parent = await AddAsync("razdel", ArticleStatus.Published, everPublished: true);
        var child = await AddAsync("statya", ArticleStatus.Published, everPublished: true, parent.Id);
        await AddAsync("koren", ArticleStatus.Published, everPublished: true, order: 1);
        await _articles.MoveToTrashAsync(child.Id, deletedById: null);
        await _articles.MoveToTrashAsync(parent.Id, deletedById: null);

        await _articles.PurgeAsync(parent.Id);
        _context.ChangeTracker.Clear();

        var trash = await _articles.GetTrashAsync();
        trash.Should().ContainSingle().Which.Should().BeEquivalentTo(new { child.Id, ParentArticleId = (int?)null, ParentInTrash = false });

        await _articles.RestoreAsync(child.Id);
        _context.ChangeTracker.Clear();
        (await _tree.GetTreeAsync(TestViewers.Admin)).Select(node => node.Title).Should().Equal("koren", "statya");
    }

    private async Task<Article> AddAsync(
        string slug, ArticleStatus status, bool everPublished, int? parentId = null, int order = 0, string? oldSlug = null)
    {
        var article = new Article
        {
            Title = slug,
            Slug = slug,
            Status = status,
            ParentArticleId = parentId,
            Order = order,
            PublishedAt = everPublished ? new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc) : null,
        };
        article.Paragraphs.Add(new Paragraph { Order = 1, Opinions = [new Opinion { Content = "Текст", IsDefault = true }] });
        if (oldSlug is not null)
        {
            article.SlugRedirects.Add(new ArticleSlugRedirect { Slug = oldSlug });
        }

        _context.Articles.Add(article);
        await _context.SaveChangesAsync();
        return article;
    }

    private List<(int Id, int Order)> OrdersUnder(int parentId)
        => _context.Articles
            .Where(article => article.ParentArticleId == parentId)
            .OrderBy(article => article.Order)
            .AsEnumerable()
            .Select(article => (article.Id, article.Order))
            .ToList();
}
