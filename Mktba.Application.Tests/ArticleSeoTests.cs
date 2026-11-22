using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Infrastructure.Repositories;
using Mktba.Infrastructure.UnitOfWork;
using NSubstitute;

namespace Mktba.Application.Tests;

/// <summary>M-10 (#28): per-article SEO title, description, social image and noindex, with fallbacks.</summary>
public class ArticleSeoTests : IDisposable
{
    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly ArticleContentService _content;
    private readonly ArticleRevisionService _revisions;

    public ArticleSeoTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        var articleRepo = new ArticleRepository(_context);
        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync().Returns(_ => _context.SaveChangesAsync());
        _content = new ArticleContentService(articleRepo, new ParagraphRepository(_context), uow, new TagRepository(_context), new ArticleDraftRepository(_context), TimeProvider.System);
        _revisions = new ArticleRevisionService(articleRepo, _content);
    }

    public void Dispose() => _context.Dispose();

    private Task<ArticleContentDto> CreateAsync(ArticleSeoDto? seo, string? summary = null, string text = "Первый текст") =>
        _content.CreateArticleWithContentAsync(new ArticleContentCreateDto(
            "Намаз",
            null,
            [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto(text, true, [])] }],
            null,
            summary,
            null,
            null,
            Seo: seo), authorId: null);

    private async Task<ArticleContentDto> ReloadAsync(int id)
    {
        _context.ChangeTracker.Clear();
        return await _content.GetContentByArticleIdAsync(id, TestViewers.Admin);
    }

    private async Task<(bool Success, AppError? Error)> UpdateSeoAsync(int id, ArticleSeoDto? seo)
    {
        var current = await ReloadAsync(id);
        var edited = current with
        {
            Paragraphs = [new ParagraphDto { Order = 1, Opinions = [new OpinionDto { Content = "Первый текст", IsDefault = true }] }],
            Seo = seo,
        };
        return await _content.UpdateContentAsync(id, edited, authorId: null);
    }

    [Fact]
    public async Task CreateArticle_WithSeoFields_StoresTrimmedValuesAndUsesThemAsMeta()
    {
        var created = await CreateAsync(new ArticleSeoDto("  Намаз: как совершать  ", " Порядок намаза ", "https://cdn.example.com/n.png", true));

        var article = await ReloadAsync(created.Id);

        article.Seo.Should().Be(new ArticleSeoDto("Намаз: как совершать", "Порядок намаза", "https://cdn.example.com/n.png", true));
        article.Meta.Should().Be(new ArticleMetaDto("Намаз: как совершать", "Порядок намаза", "https://cdn.example.com/n.png", true));
    }

    [Fact]
    public async Task CreateArticle_WithoutSeo_FallsBackToTitleAndSummary()
    {
        var created = await CreateAsync(seo: null, summary: "Краткое описание");

        var article = await ReloadAsync(created.Id);

        article.Seo.Should().Be(new ArticleSeoDto(null, null, null, false));
        // A new article is a draft, and a draft is never indexed (O-07).
        article.Meta.Should().Be(new ArticleMetaDto("Намаз", "Краткое описание", null, true));
    }

    [Fact]
    public async Task CreateArticle_WithBlankSeoAndNoSummary_DescribesWithPlainTextOfFirstParagraph()
    {
        var created = await CreateAsync(new ArticleSeoDto("  ", "", null, false), text: "## Заголовок\n\n**Намаз** — это [молитва](/article/salat).");

        var article = await ReloadAsync(created.Id);

        article.Seo!.Title.Should().BeNull();
        article.Meta!.Title.Should().Be("Намаз");
        article.Meta.Description.Should().Be("Заголовок Намаз — это молитва.");
    }

    [Fact]
    public void Excerpt_OfLongText_CutsOnWordBoundaryWithinLimitAndAddsEllipsis()
    {
        var text = string.Join(" ", Enumerable.Repeat("слово", 60));

        var excerpt = ArticleSeo.Excerpt(text)!;

        excerpt.Length.Should().BeLessThanOrEqualTo(ArticleSeo.ExcerptMaxLength);
        excerpt.Should().EndWith("слово…");
    }

    [Fact]
    public void Excerpt_OfMarkupOnly_IsNull()
    {
        ArticleSeo.Excerpt("![](/img.png) ** __ ").Should().BeNull();
    }

    [Theory]
    [InlineData("https://example.com/a.png", true)]
    [InlineData("http://example.com/a.png", true)]
    [InlineData("/uploads/a.png", true)]
    [InlineData("//evil.example.com/a.png", false)]
    [InlineData("javascript:alert(1)", false)]
    [InlineData("ftp://example.com/a.png", false)]
    [InlineData("uploads/a.png", false)]
    [InlineData("https://example.com/a b.png", false)]
    public void IsValidImageUrl_AcceptsOnlyHttpUrlsAndSiteRelativePaths(string url, bool expected)
    {
        ArticleSeo.IsValidImageUrl(url).Should().Be(expected);
    }

    [Fact]
    public async Task CreateArticle_WhenSeoTitleIsTooLong_FailsWithCode()
    {
        var act = () => CreateAsync(new ArticleSeoDto(new string('а', 71), null, null, false));

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_seo_title_too_long");
    }

    [Fact]
    public async Task CreateArticle_WithSeoTitleOfExactlyMaxLength_Succeeds()
    {
        var created = await CreateAsync(new ArticleSeoDto(new string('а', 70), null, null, false));

        created.Seo!.Title.Should().HaveLength(70);
    }

    [Fact]
    public async Task UpdateContent_WhenSeoDescriptionIsTooLong_FailsWithCodeAndKeepsOldValues()
    {
        var created = await CreateAsync(new ArticleSeoDto("Старый", null, null, false));

        var (success, error) = await UpdateSeoAsync(created.Id, new ArticleSeoDto("Новый", new string('б', 161), null, false));

        success.Should().BeFalse();
        error!.Code.Should().Be("article_seo_description_too_long");
        (await ReloadAsync(created.Id)).Seo!.Title.Should().Be("Старый");
    }

    [Fact]
    public async Task UpdateContent_WhenSocialImageUrlIsInvalid_FailsWithCode()
    {
        var created = await CreateAsync(seo: null);

        var (success, error) = await UpdateSeoAsync(created.Id, new ArticleSeoDto(null, null, "javascript:alert(1)", false));

        success.Should().BeFalse();
        error!.Code.Should().Be("article_social_image_url_invalid");
    }

    [Fact]
    public async Task UpdateContent_WithNullSeo_ClearsOverridesAndNoIndex()
    {
        var created = await CreateAsync(new ArticleSeoDto("Свой", "Описание", "/a.png", true));

        var (success, _) = await UpdateSeoAsync(created.Id, seo: null);

        success.Should().BeTrue();
        (await ReloadAsync(created.Id)).Seo.Should().Be(new ArticleSeoDto(null, null, null, false));
    }

    [Fact]
    public async Task Revisions_SnapshotSeoFields_AndRestoreBringsThemBack()
    {
        var created = await CreateAsync(new ArticleSeoDto("Первый", "Описание", "/a.png", true));
        (await UpdateSeoAsync(created.Id, new ArticleSeoDto("Второй", null, null, false))).Success.Should().BeTrue();

        var first = await _revisions.GetAsync(created.Id, 1, TestViewers.Admin);
        first.Snapshot.SchemaVersion.Should().Be(ArticleSnapshotDto.CurrentSchemaVersion);
        first.Snapshot.Seo.Should().Be(new ArticleSeoDto("Первый", "Описание", "/a.png", true));

        _context.ChangeTracker.Clear();
        await _revisions.RestoreAsync(created.Id, 1, comment: null, authorId: null, TestViewers.Admin);

        (await ReloadAsync(created.Id)).Seo.Should().Be(new ArticleSeoDto("Первый", "Описание", "/a.png", true));
    }

    [Fact]
    public async Task Restore_OfVersionOneSnapshot_ClearsSeoOverrides()
    {
        var created = await CreateAsync(new ArticleSeoDto("Свой", "Описание", "/a.png", true));
        var revision = await _context.ArticleRevisions.SingleAsync(r => r.ArticleId == created.Id);
        revision.Snapshot = $$"""
            {"schemaVersion": 1, "title": "Намаз", "slug": "{{created.Slug}}", "summary": null, "tags": [], "infobox": null,
             "paragraphs": [{"order": 1, "opinions": [{"content": "Старый текст", "isDefault": true, "schoolIds": []}]}],
             "relatedLinks": []}
            """;
        await _context.SaveChangesAsync();
        _context.ChangeTracker.Clear();

        await _revisions.RestoreAsync(created.Id, 1, comment: null, authorId: null, TestViewers.Admin);

        var restored = await ReloadAsync(created.Id);
        restored.Seo.Should().Be(new ArticleSeoDto(null, null, null, false));
        restored.Meta!.Description.Should().Be("Старый текст");
    }
}
