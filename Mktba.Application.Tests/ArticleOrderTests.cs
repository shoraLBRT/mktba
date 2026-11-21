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

/// <summary>M-05 (#26): siblings keep an explicit order; a move changes parent and position without cycles.</summary>
public class ArticleOrderTests : IDisposable
{
    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly ArticleService _articles;
    private readonly ArticleContentService _content;
    private readonly NavigationTreeService _tree;

    public ArticleOrderTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        var articleRepo = new ArticleRepository(_context);
        var mapper = new MapperConfiguration(cfg => cfg.AddProfile<MappingProfile>(), NullLoggerFactory.Instance).CreateMapper();
        _articles = new ArticleService(articleRepo, mapper, TimeProvider.System);
        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync().Returns(_ => _context.SaveChangesAsync());
        _content = new ArticleContentService(articleRepo, new ParagraphRepository(_context), uow, new TagRepository(_context), TimeProvider.System);
        _tree = new NavigationTreeService(articleRepo);
    }

    public void Dispose() => _context.Dispose();

    [Fact]
    public void IsSelfOrDescendant_GivenSelfDescendantAndUnrelatedCandidates_DetectsOnlyTheCycleCases()
    {
        var parents = new Dictionary<int, int?> { [1] = null, [2] = 1, [3] = 2, [4] = null };

        ArticleTreeRules.IsSelfOrDescendant(parents, 1, 1).Should().BeTrue();
        ArticleTreeRules.IsSelfOrDescendant(parents, 1, 3).Should().BeTrue();
        ArticleTreeRules.IsSelfOrDescendant(parents, 2, 1).Should().BeFalse();
        ArticleTreeRules.IsSelfOrDescendant(parents, 1, 4).Should().BeFalse();
    }

    [Fact]
    public void IsSelfOrDescendant_GivenCycleAlreadyInDataElsewhere_StopsWithoutLooping()
    {
        var parents = new Dictionary<int, int?> { [1] = null, [5] = 6, [6] = 5 };

        ArticleTreeRules.IsSelfOrDescendant(parents, 1, 5).Should().BeFalse();
    }

    [Fact]
    public async Task CreateAsync_GivenExistingSiblings_AppendsLastUnderTheParent()
    {
        var parent = await Create("Раздел");
        var first = await _articles.CreateAsync(new ArticleCreateDto { Title = "Первая", ParentArticleId = parent }, null);
        var second = await _content.CreateArticleWithContentAsync(
            new ArticleContentCreateDto("Вторая", parent,
                [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
                null, null, null, null), null);

        first.Order.Should().Be(0);
        (await _context.Articles.FindAsync(second.Id))!.Order.Should().Be(1);
        (await TitlesUnder(parent)).Should().Equal("Первая", "Вторая");
    }

    [Fact]
    public async Task MoveAsync_GivenIndexWithinSameParent_ReordersAndRenumbersSiblings()
    {
        var parent = await Create("Раздел");
        var a = await Create("A", parent);
        await Create("B", parent);
        await Create("C", parent);

        await _articles.MoveAsync(a, new ArticleMoveDto { ParentArticleId = parent, Index = 2 });

        (await TitlesUnder(parent)).Should().Equal("B", "C", "A");
        OrdersUnder(parent).Should().Equal(0, 1, 2);
    }

    [Fact]
    public async Task MoveAsync_GivenOtherParent_InsertsAtIndexAndClosesTheGapLeftBehind()
    {
        var left = await Create("Левый");
        var right = await Create("Правый");
        await Create("L1", left);
        var moved = await Create("L2", left);
        await Create("L3", left);
        await Create("R1", right);
        await Create("R2", right);

        await _articles.MoveAsync(moved, new ArticleMoveDto { ParentArticleId = right, Index = 1 });

        (await TitlesUnder(right)).Should().Equal("R1", "L2", "R2");
        (await TitlesUnder(left)).Should().Equal("L1", "L3");
        OrdersUnder(left).Should().Equal(0, 1);
    }

    [Fact]
    public async Task MoveAsync_GivenNullParentAndNoIndex_MakesTheArticleTheLastRoot()
    {
        var root = await Create("Корень");
        var child = await Create("Дочерняя", root);

        await _articles.MoveAsync(child, new ArticleMoveDto { ParentArticleId = null });

        (await _tree.GetTreeAsync(TestViewers.Admin)).Select(n => n.Title).Should().Equal("Корень", "Дочерняя");
    }

    [Fact]
    public async Task MoveAsync_GivenOutOfRangeIndex_ClampsToTheEnds()
    {
        var parent = await Create("Раздел");
        var a = await Create("A", parent);
        var b = await Create("B", parent);

        await _articles.MoveAsync(a, new ArticleMoveDto { ParentArticleId = parent, Index = 99 });
        (await TitlesUnder(parent)).Should().Equal("B", "A");

        await _articles.MoveAsync(a, new ArticleMoveDto { ParentArticleId = parent, Index = -5 });
        (await TitlesUnder(parent)).Should().Equal("A", "B");
    }

    [Fact]
    public async Task MoveAsync_GivenItselfOrADescendantAsParent_ThrowsCycleAndChangesNothing()
    {
        var top = await Create("Верх");
        var middle = await Create("Середина", top);
        var bottom = await Create("Низ", middle);

        var self = () => _articles.MoveAsync(top, new ArticleMoveDto { ParentArticleId = top });
        var descendant = () => _articles.MoveAsync(top, new ArticleMoveDto { ParentArticleId = bottom });

        (await self.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_move_cycle");
        (await descendant.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_move_cycle");
        _context.ChangeTracker.Clear();
        (await _context.Articles.FindAsync(top))!.ParentArticleId.Should().BeNull();
    }

    [Fact]
    public async Task MoveAsync_GivenUnknownParentOrArticle_Throws()
    {
        var article = await Create("Статья");

        var unknownParent = () => _articles.MoveAsync(article, new ArticleMoveDto { ParentArticleId = 404 });
        var unknownArticle = () => _articles.MoveAsync(404, new ArticleMoveDto());

        (await unknownParent.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_parent_not_found");
        await unknownArticle.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task MoveAsync_GivenAnyMove_WritesNoRevisionAndKeepsUpdatedAt()
    {
        var parent = await Create("Раздел");
        var article = await Create("Статья");
        var updatedAt = (await _context.Articles.FindAsync(article))!.UpdatedAt;

        await _articles.MoveAsync(article, new ArticleMoveDto { ParentArticleId = parent });

        (await _context.Articles.FindAsync(article))!.UpdatedAt.Should().Be(updatedAt);
        _context.ArticleRevisions.Should().BeEmpty();
    }

    [Fact]
    public async Task UpdateAsync_GivenDescendantAsNewParent_ThrowsCycle()
    {
        var top = await Create("Верх");
        var child = await Create("Низ", top);

        var update = () => _articles.UpdateAsync(top, new ArticleUpdateDto { Title = "Верх", ParentArticleId = child });

        (await update.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_move_cycle");
    }

    [Fact]
    public async Task UpdateAsync_GivenNewParent_AppendsLastUnderIt()
    {
        var parent = await Create("Раздел");
        await Create("Старшая", parent);
        var article = await Create("Статья");

        await _articles.UpdateAsync(article, new ArticleUpdateDto { Title = "Статья", ParentArticleId = parent });

        (await TitlesUnder(parent)).Should().Equal("Старшая", "Статья");
    }

    [Fact]
    public async Task UpdateAsync_GivenNewTitleAndTheSameParent_RenamesInPlaceKeepingSlugOrderAndRevisions()
    {
        var parent = await Create("Раздел");
        var first = await Create("Первая", parent);
        await Create("Вторая", parent);
        var slugBefore = (await _context.Articles.FindAsync(first))!.Slug;

        await _articles.UpdateAsync(first, new ArticleUpdateDto { Title = "  Новое имя  ", ParentArticleId = parent });

        var renamed = (await _context.Articles.FindAsync(first))!;
        renamed.Title.Should().Be("Новое имя");
        renamed.Slug.Should().Be(slugBefore);
        (await TitlesUnder(parent)).Should().Equal("Новое имя", "Вторая");
        _context.ArticleRevisions.Count(revision => revision.ArticleId == first).Should().Be(0);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task UpdateAsync_GivenBlankTitle_ThrowsTitleRequiredAndKeepsTheOldTitle(string title)
    {
        var article = await Create("Статья");

        var update = () => _articles.UpdateAsync(article, new ArticleUpdateDto { Title = title });

        (await update.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_title_required");
        (await _context.Articles.FindAsync(article))!.Title.Should().Be("Статья");
    }

    [Fact]
    public async Task CreateAsync_GivenBlankTitle_ThrowsTitleRequiredAndCreatesNothing()
    {
        var create = () => _articles.CreateAsync(new ArticleCreateDto { Title = " " }, null);

        (await create.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_title_required");
        _context.Articles.Count().Should().Be(0);
    }

    [Fact]
    public async Task GetTreeAsync_GivenOrderDifferentFromIds_ListsSiblingsByOrderThenId()
    {
        var parent = new Article { Title = "Раздел" };
        _context.Articles.Add(parent);
        await _context.SaveChangesAsync();
        _context.Articles.AddRange(
            new Article { Title = "Третья", ParentArticleId = parent.Id, Order = 2 },
            new Article { Title = "Первая", ParentArticleId = parent.Id, Order = 0 },
            new Article { Title = "Вторая-a", ParentArticleId = parent.Id, Order = 1 },
            new Article { Title = "Вторая-b", ParentArticleId = parent.Id, Order = 1 });
        await _context.SaveChangesAsync();

        (await TitlesUnder(parent.Id)).Should().Equal("Первая", "Вторая-a", "Вторая-b", "Третья");
    }

    private async Task<int> Create(string title, int? parentId = null)
        => (await _articles.CreateAsync(new ArticleCreateDto { Title = title, ParentArticleId = parentId }, null)).Id;

    private List<int> OrdersUnder(int parentId)
        => _context.Articles.Where(x => x.ParentArticleId == parentId).OrderBy(x => x.Order).Select(x => x.Order).ToList();

    private async Task<List<string>> TitlesUnder(int parentId)
    {
        var tree = await _tree.GetTreeAsync(TestViewers.Admin);
        return Find(tree, parentId)!.Children!.Select(node => node.Title).ToList();
    }

    private static NavigationArticleDto? Find(IEnumerable<NavigationArticleDto> nodes, int id)
        => nodes.Select(node => node.Id == id ? node : Find(node.Children ?? [], id)).FirstOrDefault(found => found is not null);
}
