using AutoMapper;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Mktba.Application.Exceptions;
using Mktba.Application.Mappings;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;
using Mktba.Infrastructure.UnitOfWork;
using NSubstitute;

namespace Mktba.Application.Tests;

public class ArticleStatusTests : IDisposable
{
    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly ArticleService _articles;
    private readonly ArticleContentService _content;
    private readonly NavigationTreeService _tree;
    private readonly RecordingSearchEngineNotifier _searchEngines = new();

    public ArticleStatusTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        var articleRepo = new ArticleRepository(_context);
        var mapper = new MapperConfiguration(cfg => cfg.AddProfile<MappingProfile>(), NullLoggerFactory.Instance).CreateMapper();
        _articles = new ArticleService(articleRepo, mapper, TimeProvider.System, _searchEngines, new AuditLogRepository(_context));
        _content = new ArticleContentService(articleRepo, new ParagraphRepository(_context), Substitute.For<IUnitOfWork>(), new TagRepository(_context), new ArticleDraftRepository(_context), TimeProvider.System);
        _tree = new NavigationTreeService(articleRepo);
    }

    public void Dispose() => _context.Dispose();

    public static TheoryData<ArticleStatus, ArticleStatus, bool> TransitionMatrix()
    {
        var allowed = new HashSet<(ArticleStatus, ArticleStatus)>
        {
            (ArticleStatus.Draft, ArticleStatus.InReview),
            (ArticleStatus.InReview, ArticleStatus.Published),
            (ArticleStatus.InReview, ArticleStatus.Draft),
            (ArticleStatus.Published, ArticleStatus.Archived),
            (ArticleStatus.Archived, ArticleStatus.Draft),
        };
        var data = new TheoryData<ArticleStatus, ArticleStatus, bool>();
        foreach (var from in Enum.GetValues<ArticleStatus>())
        {
            foreach (var to in Enum.GetValues<ArticleStatus>())
            {
                data.Add(from, to, allowed.Contains((from, to)));
            }
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(TransitionMatrix))]
    public void IsAllowed_GivenEveryPairOfStatuses_MatchesTheDocumentedTable(ArticleStatus from, ArticleStatus to, bool expected)
    {
        ArticleStatusTransitions.IsAllowed(from, to).Should().Be(expected);
    }

    [Fact]
    public void NewArticle_WhenCreated_IsDraft()
    {
        new Article().Status.Should().Be(ArticleStatus.Draft);
    }

    [Fact]
    public async Task ChangeStatusAsync_GivenAllowedTransition_StoresTheNewStatus()
    {
        var article = await AddAsync("Намаз", "namaz", ArticleStatus.InReview);

        var result = await _articles.ChangeStatusAsync(article.Id, ArticleStatus.Published, TestViewers.Admin);

        result.Status.Should().Be(ArticleStatus.Published);
        result.AllowedTransitions.Should().Equal(ArticleStatus.Archived);
        (await _context.Articles.FindAsync(article.Id))!.Status.Should().Be(ArticleStatus.Published);
    }

    [Fact]
    public async Task ChangeStatusAsync_GivenDraftToPublished_ThrowsInvalidTransitionAndKeepsDraft()
    {
        var article = await AddAsync("Намаз", "namaz", ArticleStatus.Draft);

        var act = () => _articles.ChangeStatusAsync(article.Id, ArticleStatus.Published, TestViewers.Admin);

        (await act.Should().ThrowAsync<ValidationException>())
            .Which.Error.Code.Should().Be("article_status_transition_invalid");
        (await _context.Articles.FindAsync(article.Id))!.Status.Should().Be(ArticleStatus.Draft);
    }

    [Fact]
    public async Task ChangeStatusAsync_GivenMissingArticle_ThrowsNotFound()
    {
        var act = () => _articles.ChangeStatusAsync(999, ArticleStatus.InReview, TestViewers.Admin);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Theory]
    [InlineData(ArticleStatus.InReview, ArticleStatus.Published)]
    [InlineData(ArticleStatus.Published, ArticleStatus.Archived)]
    public async Task ChangeStatusAsync_GivenMoveIntoOrOutOfPublished_TellsSearchEnginesOnce(ArticleStatus from, ArticleStatus to)
    {
        var article = await AddAsync("Закят", "zakyat", from);

        await _articles.ChangeStatusAsync(article.Id, to, TestViewers.Admin);

        _searchEngines.Slugs.Should().Equal("zakyat");
    }

    [Theory]
    [InlineData(ArticleStatus.Draft, ArticleStatus.InReview)]
    [InlineData(ArticleStatus.InReview, ArticleStatus.Draft)]
    [InlineData(ArticleStatus.Archived, ArticleStatus.Draft)]
    public async Task ChangeStatusAsync_GivenMoveOutsidePublished_DoesNotTellSearchEngines(ArticleStatus from, ArticleStatus to)
    {
        var article = await AddAsync("Хадж", "hadzh", from);

        await _articles.ChangeStatusAsync(article.Id, to, TestViewers.Admin);

        _searchEngines.Slugs.Should().BeEmpty();
    }

    [Fact]
    public async Task ChangeStatusAsync_GivenRefusedTransition_DoesNotTellSearchEngines()
    {
        var article = await AddAsync("Ихрам", "ihram", ArticleStatus.Draft);

        var act = () => _articles.ChangeStatusAsync(article.Id, ArticleStatus.Published, TestViewers.Admin);

        await act.Should().ThrowAsync<ValidationException>();
        _searchEngines.Slugs.Should().BeEmpty();
    }

    [Fact]
    public async Task GetTreeAsync_ForAnonymousReader_ReturnsOnlyPublishedAndHidesSubtreesOfUnpublishedParents()
    {
        var root = await AddAsync("Фикх", "fiqh", ArticleStatus.Published);
        await AddAsync("Намаз", "namaz", ArticleStatus.Published, root.Id);
        await AddAsync("Пост", "post", ArticleStatus.Draft, root.Id);
        var draftParent = await AddAsync("Акида", "aqida", ArticleStatus.InReview);
        await AddAsync("Таухид", "tawhid", ArticleStatus.Published, draftParent.Id);
        await AddAsync("Архив", "archive", ArticleStatus.Archived);

        var tree = await _tree.GetTreeAsync(ArticleViewer.Anonymous);

        tree.Should().ContainSingle().Which.Title.Should().Be("Фикх");
        tree[0].Children!.Select(child => child.Title).Should().Equal("Намаз");
    }

    [Fact]
    public async Task GetTreeAsync_ForEditor_ReturnsEveryArticleWithItsStatus()
    {
        var root = await AddAsync("Фикх", "fiqh", ArticleStatus.Published);
        await AddAsync("Пост", "post", ArticleStatus.Draft, root.Id);

        var tree = await _tree.GetTreeAsync(TestViewers.Admin);

        tree.Single().Status.Should().Be(ArticleStatus.Published);
        tree.Single().Children!.Single().Status.Should().Be(ArticleStatus.Draft);
    }

    [Theory]
    [InlineData(ArticleStatus.Draft)]
    [InlineData(ArticleStatus.InReview)]
    [InlineData(ArticleStatus.Archived)]
    public async Task GetContentBySlugAsync_ForAnonymousReaderOfUnpublishedArticle_ThrowsNotFound(ArticleStatus status)
    {
        await AddAsync("Намаз", "namaz", status);

        var act = () => _content.GetContentBySlugAsync("namaz", ArticleViewer.Anonymous);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task GetContentBySlugAsync_ForEditorOfDraft_ReturnsContent()
    {
        await AddAsync("Намаз", "namaz", ArticleStatus.Draft);

        var lookup = await _content.GetContentBySlugAsync("namaz", TestViewers.Admin);

        lookup.Content!.Title.Should().Be("Намаз");
    }

    [Fact]
    public async Task GetContentBySlugAsync_ForAnonymousReaderOfOldSlugOfDraft_ThrowsNotFoundInsteadOfRedirecting()
    {
        var article = await AddAsync("Намаз", "salat", ArticleStatus.Draft);
        _context.ArticleSlugRedirects.Add(new ArticleSlugRedirect { ArticleId = article.Id, Slug = "namaz" });
        await _context.SaveChangesAsync();

        var act = () => _content.GetContentBySlugAsync("namaz", ArticleViewer.Anonymous);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task GetContentByArticleIdAsync_ForAnonymousReader_LeavesOutLinksToUnpublishedArticles()
    {
        var article = await AddAsync("Намаз", "namaz", ArticleStatus.Published);
        var published = await AddAsync("Вуду", "wudu", ArticleStatus.Published);
        var draft = await AddAsync("Гусль", "ghusl", ArticleStatus.Draft);
        article.RelatedLinks.Add(new ArticleRelatedLink { RelatedArticleId = published.Id, Order = 1 });
        article.RelatedLinks.Add(new ArticleRelatedLink { RelatedArticleId = draft.Id, Order = 2 });
        await _context.SaveChangesAsync();

        var forReader = await _content.GetContentByArticleIdAsync(article.Id, ArticleViewer.Anonymous);
        var forEditor = await _content.GetContentByArticleIdAsync(article.Id, TestViewers.Admin);

        forReader.RelatedLinks!.Select(link => link.RelatedArticleTitle).Should().Equal("Вуду");
        forEditor.RelatedLinks.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetAllAsync_ForAnonymousReader_ReturnsOnlyPublished()
    {
        await AddAsync("Намаз", "namaz", ArticleStatus.Published);
        await AddAsync("Пост", "post", ArticleStatus.Draft);

        var forReader = await _articles.GetAllAsync(ArticleViewer.Anonymous);
        var forEditor = await _articles.GetAllAsync(TestViewers.Admin);

        forReader.Select(article => article.Title).Should().Equal("Намаз");
        forEditor.Should().HaveCount(2);
    }

    private async Task<Article> AddAsync(string title, string slug, ArticleStatus status, int? parentId = null)
    {
        var article = new Article { Title = title, Slug = slug, Status = status, ParentArticleId = parentId };
        _context.Articles.Add(article);
        await _context.SaveChangesAsync();
        return article;
    }
}
