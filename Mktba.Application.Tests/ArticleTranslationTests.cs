using FluentAssertions;
using NSubstitute;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;
using Mktba.Infrastructure.UnitOfWork;

namespace Mktba.Application.Tests;

/// <summary>I-06 (#110): a translation is a linked article with its own slug and status, marked outdated after its source is edited.</summary>
public class ArticleTranslationTests : IDisposable
{
    private static readonly ArticleViewer Admin = new(1, EditsAnyArticle: true, ReviewsArticles: true);

    private readonly MktbaDbContext _context;
    private readonly ArticleContentService _service;

    public ArticleTranslationTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync().Returns(_ => _context.SaveChangesAsync());
        _service = new ArticleContentService(new ArticleRepository(_context), new ParagraphRepository(_context), uow, new TagRepository(_context), new ArticleDraftRepository(_context), TimeProvider.System);
    }

    public void Dispose() => _context.Dispose();

    private Task<ArticleContentDto> CreateAsync(string title, string? locale = null, int? translationOf = null, ArticleViewer? viewer = null) =>
        _service.CreateArticleWithContentAsync(new ArticleContentCreateDto(
            title,
            null,
            [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Text", true, [])] }],
            null,
            null,
            null,
            null,
            Locale: locale,
            TranslationOfId: translationOf), authorId: null, viewer);

    private async Task<ArticleContentDto> ReadAsync(int id, ArticleViewer? viewer = null)
    {
        _context.ChangeTracker.Clear();
        return await _service.GetContentByArticleIdAsync(id, viewer ?? Admin);
    }

    /// <summary>Saves the article as the editor would; opinions go as new (id 0) for the InMemory provider.</summary>
    private async Task<(bool Success, AppError? Error)> SaveAsync(ArticleContentDto article)
    {
        _context.ChangeTracker.Clear();
        foreach (var opinion in article.Paragraphs.SelectMany(paragraph => paragraph.Opinions))
        {
            opinion.Id = 0;
        }

        return await _service.UpdateContentAsync(article.Id, article, authorId: null);
    }

    private async Task<(ArticleContentDto Original, ArticleContentDto Translation)> CreatePairAsync()
    {
        var original = await CreateAsync("Намаз");
        var translation = await CreateAsync("Prayer", locale: "en", translationOf: original.Id, viewer: Admin);
        return (original, translation);
    }

    [Fact]
    public async Task GivenOriginal_WhenTranslating_ThenTranslationJoinsItsGroupWithOwnSlugAndDraftStatus()
    {
        var (original, translation) = await CreatePairAsync();

        translation.TranslationGroupId.Should().Be(original.TranslationGroupId);
        translation.Locale.Should().Be("en");
        translation.Slug.Should().Be("prayer");
        _context.Articles.Single(article => article.Id == translation.Id).Status.Should().Be(ArticleStatus.Draft);
    }

    [Fact]
    public async Task GivenFreshTranslation_WhenEditorReadsIt_ThenSourceIsShownAndNotOutdated()
    {
        var (original, translation) = await CreatePairAsync();

        var read = await ReadAsync(translation.Id);

        read.TranslatedFrom.Should().Be(new ArticleTranslationSourceDto(original.Id, "ru", original.Slug!, "Намаз", 1, 1, IsOutdated: false));
        read.TranslatedFromRevision.Should().Be(1);
        read.Translations.Should().ContainSingle().Which.Should().Be(new ArticleTranslationDto(original.Id, "ru", original.Slug!, "Намаз", ArticleStatus.Draft));
        (await ReadAsync(original.Id)).Translations.Should().ContainSingle().Which.ArticleId.Should().Be(translation.Id);
        (await ReadAsync(original.Id)).TranslatedFrom.Should().BeNull();
    }

    [Fact]
    public async Task GivenSourceEditedAfterTranslating_WhenReadingTranslation_ThenItIsOutdated()
    {
        var (original, translation) = await CreatePairAsync();

        var saved = await SaveAsync((await ReadAsync(original.Id)) with { Title = "Намаз (молитва)" });

        saved.Success.Should().BeTrue(saved.Error?.Code);
        var read = await ReadAsync(translation.Id);
        read.TranslatedFrom!.IsOutdated.Should().BeTrue();
        read.TranslatedFrom.Revision.Should().Be(1);
        read.TranslatedFrom.LatestRevision.Should().Be(2);
    }

    [Fact]
    public async Task GivenOutdatedTranslation_WhenSavedAsMatchingLatestRevision_ThenItIsNoLongerOutdated()
    {
        var (original, translation) = await CreatePairAsync();
        await SaveAsync((await ReadAsync(original.Id)) with { Title = "Намаз (молитва)" });

        var saved = await SaveAsync((await ReadAsync(translation.Id)) with { TranslatedFromRevision = 2 });

        saved.Success.Should().BeTrue(saved.Error?.Code);
        (await ReadAsync(translation.Id)).TranslatedFrom!.IsOutdated.Should().BeFalse();
    }

    [Fact]
    public async Task GivenOutdatedTranslation_WhenSavedWithTheRevisionItRead_ThenItStaysOutdated()
    {
        var (original, translation) = await CreatePairAsync();
        await SaveAsync((await ReadAsync(original.Id)) with { Title = "Намаз (молитва)" });

        await SaveAsync(await ReadAsync(translation.Id) with { Title = "Prayer (salah)" });

        (await ReadAsync(translation.Id)).TranslatedFrom!.IsOutdated.Should().BeTrue();
    }

    [Fact]
    public async Task GivenRevisionTheSourceDoesNotHave_WhenSavingTranslation_ThenRejects()
    {
        var (_, translation) = await CreatePairAsync();

        var saved = await SaveAsync((await ReadAsync(translation.Id)) with { TranslatedFromRevision = 5 });

        saved.Success.Should().BeFalse();
        saved.Error!.Code.Should().Be("article_translation_revision_invalid");
    }

    [Theory]
    [InlineData("en")]
    [InlineData("ru")]
    public async Task GivenGroupHasLanguage_WhenTranslatingIntoIt_ThenRejectsWithTranslationExists(string locale)
    {
        var (original, _) = await CreatePairAsync();

        var act = () => CreateAsync("Again", locale: locale, translationOf: original.Id, viewer: Admin);

        var error = (await act.Should().ThrowAsync<ValidationException>()).Which.Error;
        error.Code.Should().Be("article_translation_exists");
        error.Params!["locale"].Should().Be(locale);
    }

    [Fact]
    public async Task GivenUnknownSource_WhenTranslating_ThenRejectsWithSourceNotFound()
    {
        var act = () => CreateAsync("Prayer", locale: "en", translationOf: 404, viewer: Admin);

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_translation_source_not_found");
    }

    [Fact]
    public async Task GivenSomeoneElsesDraft_WhenAuthorTranslatesIt_ThenRejectsWithSourceNotFound()
    {
        var original = await CreateAsync("Намаз");
        var author = new ArticleViewer(42, EditsAnyArticle: false, ReviewsArticles: false);

        var act = () => CreateAsync("Prayer", locale: "en", translationOf: original.Id, viewer: author);

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_translation_source_not_found");
    }

    [Fact]
    public async Task GivenPublishedOriginalAndDraftTranslation_WhenReaderReads_ThenOnlyPublishedVersionsAreListedAndNoSource()
    {
        var (original, translation) = await CreatePairAsync();
        _context.Articles.Single(article => article.Id == original.Id).Status = ArticleStatus.Published;
        await _context.SaveChangesAsync();

        (await ReadAsync(original.Id, ArticleViewer.Anonymous)).Translations.Should().BeEmpty();

        _context.Articles.Single(article => article.Id == translation.Id).Status = ArticleStatus.Published;
        await _context.SaveChangesAsync();
        var read = await ReadAsync(translation.Id, ArticleViewer.Anonymous);
        read.Translations.Should().ContainSingle().Which.Locale.Should().Be("ru");
        read.TranslatedFrom.Should().BeNull();
        read.TranslatedFromRevision.Should().BeNull();
    }
}
