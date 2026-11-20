using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;
using Mktba.Infrastructure.UnitOfWork;

namespace Mktba.Application.Tests;

/// <summary>M-09 (#27): articles carry a locale and a translation group; slugs are unique per locale.</summary>
public class ArticleLocaleTests : IDisposable
{
    private readonly MktbaDbContext _context;
    private readonly ArticleContentService _service;

    public ArticleLocaleTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync().Returns(_ => _context.SaveChangesAsync());
        _service = new ArticleContentService(new ArticleRepository(_context), new ParagraphRepository(_context), uow, TimeProvider.System);
    }

    public void Dispose() => _context.Dispose();

    private Task<ArticleContentDto> CreateAsync(string title, string? slug = null, string? locale = null) =>
        _service.CreateArticleWithContentAsync(new ArticleContentCreateDto(
            title,
            null,
            [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Text", true, [])] }],
            null,
            null,
            null,
            null,
            slug,
            Locale: locale), authorId: null);

    /// <summary>Saves a new slug as the editor would; opinions go as new (id 0) for the InMemory provider.</summary>
    private async Task RenameSlugAsync(ArticleContentDto article, string slug)
    {
        _context.ChangeTracker.Clear();
        foreach (var opinion in article.Paragraphs.SelectMany(paragraph => paragraph.Opinions))
        {
            opinion.Id = 0;
        }

        var (success, error) = await _service.UpdateContentAsync(article.Id, article with { Slug = slug }, authorId: null);
        success.Should().BeTrue(error?.Code);
    }

    [Fact]
    public async Task GivenNoLocale_WhenCreating_ThenArticleIsRussianInItsOwnTranslationGroup()
    {
        var first = await CreateAsync("Намаз");
        var second = await CreateAsync("Закят");

        first.Locale.Should().Be("ru");
        first.TranslationGroupId.Should().NotBeNull().And.NotBe(Guid.Empty);
        second.TranslationGroupId.Should().NotBe(first.TranslationGroupId!.Value);
    }

    [Fact]
    public async Task GivenLocaleInAnyCase_WhenCreating_ThenItIsStoredLowercased()
    {
        var article = await CreateAsync("Prayer", locale: " EN ");

        article.Locale.Should().Be("en");
    }

    [Fact]
    public async Task GivenUnsupportedLocale_WhenCreating_ThenRejectsWithLocaleUnsupported()
    {
        var act = () => CreateAsync("Prière", locale: "fr");

        var error = (await act.Should().ThrowAsync<ValidationException>()).Which.Error;
        error.Code.Should().Be("locale_unsupported");
        error.Params!["locale"].Should().Be("fr");
        (await _context.Articles.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task GivenSlugUsedInRussian_WhenCreatingEnglishArticleWithIt_ThenItIsAllowed()
    {
        var russian = await CreateAsync("Намаз", "namaz");

        var english = await CreateAsync("Prayer", "namaz", "en");

        english.Slug.Should().Be("namaz");
        english.Id.Should().NotBe(russian.Id);
    }

    [Fact]
    public async Task GivenSlugUsedInSameLocale_WhenCreating_ThenRejectsWithSlugTaken()
    {
        await CreateAsync("Prayer", "salah", "en");

        var act = () => CreateAsync("Another prayer", "salah", "en");

        (await act.Should().ThrowAsync<ValidationException>())
            .Which.Error.Code.Should().Be(AppErrors.ArticleSlugTaken("salah").Code);
    }

    [Fact]
    public async Task GivenGeneratedSlugTakenOnlyInOtherLocale_WhenCreating_ThenNoSuffixIsAdded()
    {
        await CreateAsync("Namaz", locale: "en");

        var russian = await CreateAsync("Намаз");

        russian.Slug.Should().Be("namaz");
    }

    [Fact]
    public async Task GivenSameSlugInTwoLocales_WhenLookingUp_ThenEachLocaleFindsItsOwnArticle()
    {
        var russian = await CreateAsync("Намаз", "namaz");
        var english = await CreateAsync("Prayer", "namaz", "en");

        var byDefault = await _service.GetContentBySlugAsync("namaz", TestViewers.Admin);
        var byEnglish = await _service.GetContentBySlugAsync("namaz", TestViewers.Admin, "en");

        byDefault.Content!.Id.Should().Be(russian.Id);
        byEnglish.Content!.Id.Should().Be(english.Id);
    }

    [Fact]
    public async Task GivenOldRussianSlug_WhenEnglishArticleTakesIt_ThenBothLookupsStillWork()
    {
        var russian = await CreateAsync("Намаз", "namaz");
        await RenameSlugAsync(russian, "salat");

        var english = await CreateAsync("Prayer", "namaz", "en");

        var redirect = await _service.GetContentBySlugAsync("namaz", TestViewers.Admin);
        redirect.RedirectToSlug.Should().Be("salat");
        var direct = await _service.GetContentBySlugAsync("namaz", TestViewers.Admin, "en");
        direct.Content!.Id.Should().Be(english.Id);
        (await _context.ArticleSlugRedirects.SingleAsync()).Locale.Should().Be("ru");
    }

    [Fact]
    public async Task GivenUnsupportedLocale_WhenLookingUpBySlug_ThenRejectsWithLocaleUnsupported()
    {
        await CreateAsync("Намаз", "namaz");

        var act = () => _service.GetContentBySlugAsync("namaz", TestViewers.Admin, "xx");

        (await act.Should().ThrowAsync<ValidationException>())
            .Which.Error.Code.Should().Be("locale_unsupported");
    }

    [Fact]
    public async Task GivenEnglishArticle_WhenUpdating_ThenLocaleAndGroupStayUnchanged()
    {
        var english = await CreateAsync("Prayer", "salah", "en");

        await RenameSlugAsync(english with { Locale = "ru", TranslationGroupId = Guid.NewGuid() }, "salat");

        var saved = await _service.GetContentByArticleIdAsync(english.Id, TestViewers.Admin);
        saved.Locale.Should().Be("en");
        saved.TranslationGroupId.Should().Be(english.TranslationGroupId);
        saved.Slug.Should().Be("salat");
    }

    [Fact]
    public async Task GivenSystemSchools_WhenSeeding_ThenEachGetsOneEnglishName()
    {
        await SystemSchoolSeeder.SeedAsync(_context);
        await SystemSchoolSeeder.SeedAsync(_context);

        var schools = await _context.Schools.Include(s => s.Translations).ToListAsync();
        schools.Should().HaveCount(4);
        schools.Should().OnlyContain(s => s.Translations.Count == 1 && s.Translations.Single().Locale == "en");
        schools.Single(s => s.Slug == "hanafi").Name.Should().Be("Ханафитский мазхаб");
        schools.Single(s => s.Slug == "hanafi").Translations.Single().Name.Should().Be("Hanafi madhhab");
    }

    [Theory]
    [InlineData(null, "ru")]
    [InlineData("", "ru")]
    [InlineData("Ru", "ru")]
    [InlineData("en", "en")]
    [InlineData("de", null)]
    public void GivenLocaleCode_WhenNormalizing_ThenReturnsSupportedCodeOrNull(string? input, string? expected)
    {
        Locales.Normalize(input).Should().Be(expected);
    }
}
