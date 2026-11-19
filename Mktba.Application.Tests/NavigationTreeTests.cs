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
        var tree = await _service.GetTreeAsync(TestViewers.Admin);

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

        var tree = await _service.GetTreeAsync(TestViewers.Admin);

        tree.Should().HaveCount(2);
        tree.Should().AllSatisfy(node => node.Children.Should().BeEmpty());
    }

    [Fact]
    public async Task GetTreeAsync_ArticleWithSlug_ExposesSlugForLinks()
    {
        _context.Articles.Add(new Article { Title = "Намаз", Slug = "namaz" });
        await _context.SaveChangesAsync();

        var tree = await _service.GetTreeAsync(TestViewers.Admin);

        tree.Single().Slug.Should().Be("namaz");
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

        var tree = await _service.GetTreeAsync(TestViewers.Admin);

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

        var tree = await _service.GetTreeAsync(TestViewers.Admin);

        tree[0].HasContent.Should().BeTrue();
    }

    [Fact]
    public async Task GetTreeAsync_HasContent_FalseWhenNoParagraphsOrInfobox()
    {
        _context.Articles.Add(new Article { Title = "Empty" });
        await _context.SaveChangesAsync();

        var tree = await _service.GetTreeAsync(TestViewers.Admin);

        tree[0].HasContent.Should().BeFalse();
    }

    [Fact]
    public async Task GetTreeAsync_HasContent_TrueWhenOnlyInfoboxFieldExists()
    {
        var article = new Article { Title = "Infobox only" };
        article.InfoboxFields.Add(new ArticleInfoboxField { Key = "born", Label = "Born", Value = "1000", Order = 1 });
        _context.Articles.Add(article);
        await _context.SaveChangesAsync();

        var tree = await _service.GetTreeAsync(TestViewers.Admin);

        tree[0].HasContent.Should().BeTrue();
    }

    [Fact]
    public async Task GetTreeAsync_HasContent_TrueWhenOnlyInfoboxSubtitleSet()
    {
        _context.Articles.Add(new Article { Title = "Subtitle only", InfoboxSubtitle = "Imam" });
        await _context.SaveChangesAsync();

        var tree = await _service.GetTreeAsync(TestViewers.Admin);

        tree[0].HasContent.Should().BeTrue();
    }

    [Fact]
    public async Task GetTreeAsync_HasContent_FalseWhenInfoboxTitleIsWhitespace()
    {
        _context.Articles.Add(new Article { Title = "Blank infobox", InfoboxTitle = "   " });
        await _context.SaveChangesAsync();

        var tree = await _service.GetTreeAsync(TestViewers.Admin);

        tree[0].HasContent.Should().BeFalse();
    }

    [Fact]
    public async Task GetTreeAsync_MixedContent_ReportsHasContentPerNodeAndKeepsShape()
    {
        var root = new Article { Title = "Root" };
        _context.Articles.Add(root);
        await _context.SaveChangesAsync();

        var withText = new Article { Title = "With text", ParentArticleId = root.Id };
        var empty = new Article { Title = "Empty", ParentArticleId = root.Id };
        _context.Articles.AddRange(withText, empty);
        await _context.SaveChangesAsync();

        var paragraph = new Paragraph { ArticleId = withText.Id, Order = 1 };
        paragraph.Opinions.Add(new Opinion { Content = "Text", IsDefault = true });
        _context.Paragraphs.Add(paragraph);
        await _context.SaveChangesAsync();

        var tree = await _service.GetTreeAsync(TestViewers.Admin);

        tree.Should().ContainSingle();
        tree[0].HasContent.Should().BeFalse();
        tree[0].Children!.Select(child => (child.Title, child.HasContent))
            .Should().Equal(("With text", true), ("Empty", false));
        tree[0].Children!.Should().AllSatisfy(child => child.Children.Should().BeEmpty());
    }
}
