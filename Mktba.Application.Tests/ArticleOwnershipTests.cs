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

/// <summary>U-02 (#30): what an author sees of their own articles and of everyone else's.</summary>
public class ArticleOwnershipTests : IDisposable
{
    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly ArticleService _articles;
    private readonly ArticleContentService _content;
    private readonly NavigationTreeService _tree;

    public ArticleOwnershipTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        var articleRepo = new ArticleRepository(_context);
        var mapper = new MapperConfiguration(cfg => cfg.AddProfile<MappingProfile>(), NullLoggerFactory.Instance).CreateMapper();
        _articles = new ArticleService(articleRepo, mapper, TimeProvider.System);
        _content = new ArticleContentService(articleRepo, new ParagraphRepository(_context), Substitute.For<IUnitOfWork>(), new TagRepository(_context), TimeProvider.System);
        _tree = new NavigationTreeService(articleRepo);
    }

    public void Dispose() => _context.Dispose();

    [Fact]
    public void ArticleViewer_GivenOwnerCoAuthorAndStranger_GrantsEditOnlyToOwnersAndAdmins()
    {
        var author = TestViewers.Author(1);
        var coAuthor = TestViewers.Author(2);
        var stranger = TestViewers.Author(3);
        int[] coAuthors = [2];

        author.CanEdit(1, coAuthors).Should().BeTrue();
        coAuthor.CanEdit(1, coAuthors).Should().BeTrue();
        stranger.CanEdit(1, coAuthors).Should().BeFalse();
        TestViewers.Admin.CanEdit(1, coAuthors).Should().BeTrue();
        ArticleViewer.Anonymous.CanEdit(null, []).Should().BeFalse();
        stranger.CanSee(ArticleStatus.Draft, 1, coAuthors).Should().BeFalse();
        stranger.CanSee(ArticleStatus.Published, 1, coAuthors).Should().BeTrue();
    }

    [Fact]
    public void ArticleViewer_GivenAnOwnerWhoIsNotAReviewer_AllowsOnlySubmitAndTakeBack()
    {
        var author = TestViewers.Author(1);
        int[] none = [];

        foreach (var from in Enum.GetValues<ArticleStatus>())
        {
            foreach (var to in Enum.GetValues<ArticleStatus>())
            {
                var expected = (from, to) is (ArticleStatus.Draft, ArticleStatus.InReview) or (ArticleStatus.InReview, ArticleStatus.Draft);
                author.CanChangeStatus(from, to, 1, none).Should().Be(expected, $"{from} → {to}");
                TestViewers.Author(9).CanChangeStatus(from, to, 1, none).Should().BeFalse($"stranger {from} → {to}");
                TestViewers.Admin.CanChangeStatus(from, to, 1, none).Should().BeTrue();
            }
        }
    }

    [Fact]
    public async Task GetTreeAsync_ForAnAuthor_ShowsPublishedAndOwnDraftsAndMarksOnlyOwnAsEditable()
    {
        var (authorId, otherId) = await AddUsersAsync();
        var published = await AddAsync("Намаз", ArticleStatus.Published, otherId);
        await AddAsync("Свой черновик", ArticleStatus.Draft, authorId, parentId: published.Id);
        await AddAsync("Чужой черновик", ArticleStatus.Draft, otherId);
        var coAuthored = await AddAsync("Соавторство", ArticleStatus.InReview, otherId);
        _context.ArticleCoAuthors.Add(new ArticleCoAuthor { ArticleId = coAuthored.Id, UserId = authorId });
        await _context.SaveChangesAsync();

        var tree = await _tree.GetTreeAsync(TestViewers.Author(authorId));

        tree.Select(node => (node.Title, node.CanEdit)).Should().BeEquivalentTo(new[] { ("Намаз", false), ("Соавторство", true) });
        tree.Single(node => node.Title == "Намаз").Children!.Select(child => (child.Title, child.CanEdit))
            .Should().Equal(("Свой черновик", true));
    }

    [Fact]
    public async Task GetTreeAsync_ForAnAuthorWhoseDraftSitsUnderAHiddenParent_ShowsTheDraftAsARoot()
    {
        var (authorId, otherId) = await AddUsersAsync();
        var hiddenParent = await AddAsync("Чужой черновик", ArticleStatus.Draft, otherId);
        await AddAsync("Свой черновик", ArticleStatus.Draft, authorId, parentId: hiddenParent.Id);

        var tree = await _tree.GetTreeAsync(TestViewers.Author(authorId));

        tree.Select(node => node.Title).Should().Equal("Свой черновик");
    }

    [Fact]
    public async Task GetContentByArticleIdAsync_ForAnAuthor_ReturnsOwnDraftAndHidesSomeoneElsesDraft()
    {
        var (authorId, otherId) = await AddUsersAsync();
        var own = await AddAsync("Свой черновик", ArticleStatus.Draft, authorId);
        var foreign = await AddAsync("Чужой черновик", ArticleStatus.Draft, otherId);

        var content = await _content.GetContentByArticleIdAsync(own.Id, TestViewers.Author(authorId));
        var act = () => _content.GetContentByArticleIdAsync(foreign.Id, TestViewers.Author(authorId));

        content.Title.Should().Be("Свой черновик");
        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task GetByIdAsync_ForAnAuthor_ListsOnlyTheStatusMovesTheAuthorMayMake()
    {
        var (authorId, _) = await AddUsersAsync();
        var inReview = await AddAsync("На проверке", ArticleStatus.InReview, authorId);

        var forAuthor = await _articles.GetByIdAsync(inReview.Id, TestViewers.Author(authorId));
        var forAdmin = await _articles.GetByIdAsync(inReview.Id, TestViewers.Admin);

        forAuthor!.AllowedTransitions.Should().Equal(ArticleStatus.Draft);
        forAdmin!.AllowedTransitions.Should().BeEquivalentTo(new[] { ArticleStatus.Published, ArticleStatus.Draft });
    }

    [Fact]
    public async Task GetAllAsync_ForAnAuthor_ReturnsPublishedAndOwnArticlesOnly()
    {
        var (authorId, otherId) = await AddUsersAsync();
        await AddAsync("Опубликована", ArticleStatus.Published, otherId);
        await AddAsync("Свой черновик", ArticleStatus.Draft, authorId);
        await AddAsync("Чужой черновик", ArticleStatus.Draft, otherId);

        var articles = await _articles.GetAllAsync(TestViewers.Author(authorId));

        articles.Select(article => article.Title).Should().BeEquivalentTo(new[] { "Опубликована", "Свой черновик" });
    }

    private async Task<(int AuthorId, int OtherId)> AddUsersAsync()
    {
        var author = new User { Email = "author@mktba.test", Role = UserRole.Author };
        var other = new User { Email = "other@mktba.test", Role = UserRole.Author };
        _context.Users.AddRange(author, other);
        await _context.SaveChangesAsync();
        return (author.Id, other.Id);
    }

    private async Task<Article> AddAsync(string title, ArticleStatus status, int authorId, int? parentId = null)
    {
        var article = new Article
        {
            Title = title,
            Slug = $"a-{Guid.NewGuid():N}",
            Status = status,
            AuthorId = authorId,
            ParentArticleId = parentId,
        };
        _context.Articles.Add(article);
        await _context.SaveChangesAsync();
        return article;
    }
}
