using FluentAssertions;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

public class NavigationTreeTests : IDisposable
{
    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly NavigationTreeService _service;

    public NavigationTreeTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        var articleRepo = new ArticleRepository(_context);
        _service = new NavigationTreeService(articleRepo);
    }

    public void Dispose() => _context.Dispose();

    [Fact]
    public async Task GetTreeAsync_EmptyDatabase_ReturnsEmptyList()
    {
        var tree = await _service.GetTreeAsync();

        tree.Should().BeEmpty();
    }

    [Fact]
    public async Task GetTreeAsync_AllRootArticles_ReturnsFlat()
    {
        _context.Articles.AddRange(
            new Article { Title = "Root 1" },
            new Article { Title = "Root 2" }
        );
        await _context.SaveChangesAsync();

        var tree = await _service.GetTreeAsync();

        tree.Should().HaveCount(2);
        tree.Should().AllSatisfy(node => node.Children.Should().BeEmpty());
    }

    [Fact]
    public async Task GetTreeAsync_ParentChild_BuildsHierarchy()
    {
        var parent = new Article { Title = "Parent" };
        _context.Articles.Add(parent);
        await _context.SaveChangesAsync();

        var child = new Article { Title = "Child", ParentArticleId = parent.Id };
        _context.Articles.Add(child);
        await _context.SaveChangesAsync();

        var tree = await _service.GetTreeAsync();

        tree.Should().HaveCount(1);
        tree[0].Title.Should().Be("Parent");
        tree[0].Children.Should().HaveCount(1);
        tree[0].Children![0].Title.Should().Be("Child");
    }

    [Fact]
    public async Task GetTreeAsync_HasContent_TrueWhenParagraphExists()
    {
        var article = new Article { Title = "With Content" };
        _context.Articles.Add(article);
        await _context.SaveChangesAsync();

        var paragraph = new Paragraph { ArticleId = article.Id, Order = 1 };
        paragraph.Opinions.Add(new Opinion { Content = "Text", IsDefault = true });
        _context.Paragraphs.Add(paragraph);
        await _context.SaveChangesAsync();

        var tree = await _service.GetTreeAsync();

        tree[0].HasContent.Should().BeTrue();
    }

    [Fact]
    public async Task GetTreeAsync_HasContent_FalseWhenNoParagraphsOrInfobox()
    {
        _context.Articles.Add(new Article { Title = "Empty" });
        await _context.SaveChangesAsync();

        var tree = await _service.GetTreeAsync();

        tree[0].HasContent.Should().BeFalse();
    }
}
