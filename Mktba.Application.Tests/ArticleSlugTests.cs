using FluentAssertions;
using NSubstitute;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Infrastructure.Repositories;
using Mktba.Infrastructure.UnitOfWork;

namespace Mktba.Application.Tests;

/// <summary>M-01 (#22): slugs are unique, editable, and an old slug keeps leading to the article.</summary>
public class ArticleSlugTests : IDisposable
{
    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly ArticleContentService _service;

    public ArticleSlugTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync().Returns(_ => _context.SaveChangesAsync());
        _service = new ArticleContentService(new ArticleRepository(_context), new ParagraphRepository(_context), uow, TimeProvider.System);
    }

    public void Dispose() => _context.Dispose();

    private Task<ArticleContentDto> CreateAsync(string title, string? slug = null) =>
        _service.CreateArticleWithContentAsync(new ArticleContentCreateDto(
            title,
            null,
            [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Text", true, [])] }],
            null,
            null,
            null,
            null,
            slug), authorId: null);

    /// <summary>
    /// Saves the article as the editor would. Each API request gets its own DbContext; tests share
    /// one, so tracked entities are forgotten first. Opinions are sent as new (id 0): the InMemory
    /// provider cannot re-attach a replaced opinion under its old id, and these tests are about slugs.
    /// </summary>
    private Task<(bool Success, AppError? Error)> UpdateAsync(ArticleContentDto article)
    {
        _context.ChangeTracker.Clear();
        foreach (var opinion in article.Paragraphs.SelectMany(paragraph => paragraph.Opinions))
        {
            opinion.Id = 0;
        }

        return _service.UpdateContentAsync(article.Id, article);
    }

    private async Task<ArticleContentDto> RenameSlugAsync(ArticleContentDto article, string? slug)
    {
        var (success, error) = await UpdateAsync(article with { Slug = slug });
        success.Should().BeTrue(error?.Code);
        return await _service.GetContentByArticleIdAsync(article.Id, includeUnpublished: true);
    }

    [Fact]
    public async Task GivenNoSlug_WhenCreating_ThenSlugIsGeneratedFromTitle()
    {
        var article = await CreateAsync("Намаз путника");

        article.Slug.Should().Be("namaz-putnika");
    }

    [Fact]
    public async Task GivenSameTitleTwice_WhenCreating_ThenSecondSlugGetsNumberSuffix()
    {
        await CreateAsync("Намаз");
        var second = await CreateAsync("Намаз");
        var third = await CreateAsync("намаз!");

        second.Slug.Should().Be("namaz-2");
        third.Slug.Should().Be("namaz-3");
    }

    [Fact]
    public async Task GivenManualSlug_WhenCreating_ThenItIsUsedLowercased()
    {
        var article = await CreateAsync("Намаз", " Salat ");

        article.Slug.Should().Be("salat");
    }

    [Theory]
    [InlineData("намаз")]
    [InlineData("na maz")]
    [InlineData("1446")]
    public async Task GivenInvalidManualSlug_WhenCreating_ThenRejectsWithSlugInvalid(string slug)
    {
        var act = () => CreateAsync("Намаз", slug);

        (await act.Should().ThrowAsync<ValidationException>())
            .Which.Error.Code.Should().Be(AppErrors.ArticleSlugInvalid.Code);
    }

    [Fact]
    public async Task GivenSlugOfAnotherArticle_WhenCreating_ThenRejectsWithSlugTaken()
    {
        await CreateAsync("Намаз");

        var act = () => CreateAsync("Другая статья", "namaz");

        (await act.Should().ThrowAsync<ValidationException>())
            .Which.Error.Code.Should().Be(AppErrors.ArticleSlugTaken("namaz").Code);
    }

    [Fact]
    public async Task GivenNewSlug_WhenUpdating_ThenOldSlugRedirectsToNewOne()
    {
        var article = await CreateAsync("Намаз");

        var renamed = await RenameSlugAsync(article, "salat");

        renamed.Slug.Should().Be("salat");
        var byOld = await _service.GetContentBySlugAsync("namaz", includeUnpublished: true);
        byOld.Content.Should().BeNull();
        byOld.RedirectToSlug.Should().Be("salat");
        var byNew = await _service.GetContentBySlugAsync("salat", includeUnpublished: true);
        byNew.Content!.Id.Should().Be(article.Id);
    }

    [Fact]
    public async Task GivenTwoRenames_WhenLookingUpFirstSlug_ThenRedirectsToCurrentSlug()
    {
        var article = await CreateAsync("Намаз");
        await RenameSlugAsync(article, "salat");
        await RenameSlugAsync(article with { Slug = "salat" }, "salyat");

        var lookup = await _service.GetContentBySlugAsync("namaz", includeUnpublished: true);

        lookup.RedirectToSlug.Should().Be("salyat");
    }

    [Fact]
    public async Task GivenRevertToOldSlug_WhenUpdating_ThenOldSlugIsCurrentAgainAndNewOneRedirects()
    {
        var article = await CreateAsync("Намаз");
        await RenameSlugAsync(article, "salat");

        var reverted = await RenameSlugAsync(article, "namaz");

        reverted.Slug.Should().Be("namaz");
        (await _service.GetContentBySlugAsync("namaz", includeUnpublished: true)).Content!.Id.Should().Be(article.Id);
        (await _service.GetContentBySlugAsync("salat", includeUnpublished: true)).RedirectToSlug.Should().Be("namaz");
        _context.ArticleSlugRedirects.Select(r => r.Slug).Should().BeEquivalentTo(["salat"]);
    }

    [Fact]
    public async Task GivenBlankSlug_WhenUpdating_ThenSlugIsKept()
    {
        var article = await CreateAsync("Намаз");

        var updated = await RenameSlugAsync(article with { Title = "Совсем другое" }, "  ");

        updated.Slug.Should().Be("namaz");
        _context.ArticleSlugRedirects.Should().BeEmpty();
    }

    [Fact]
    public async Task GivenOldSlugOfAnotherArticle_WhenUpdating_ThenRejectsWithSlugTaken()
    {
        var first = await CreateAsync("Намаз");
        await RenameSlugAsync(first, "salat");
        var second = await CreateAsync("Пост");

        var (success, error) = await UpdateAsync(second with { Slug = "namaz" });

        success.Should().BeFalse();
        error!.Code.Should().Be(AppErrors.ArticleSlugTaken("namaz").Code);
    }

    [Fact]
    public async Task GivenOldSlugOfAnotherArticle_WhenGenerating_ThenSkipsIt()
    {
        var first = await CreateAsync("Намаз");
        await RenameSlugAsync(first, "salat");

        var second = await CreateAsync("Намаз");

        second.Slug.Should().Be("namaz-2");
    }

    [Fact]
    public async Task GivenUnknownSlug_WhenLookingUp_ThenThrowsNotFound()
    {
        var act = () => _service.GetContentBySlugAsync("missing", includeUnpublished: true);

        (await act.Should().ThrowAsync<NotFoundException>())
            .Which.Error.Code.Should().Be(AppErrors.ArticleNotFound.Code);
    }

    [Fact]
    public async Task GivenUppercaseSlug_WhenLookingUp_ThenFindsArticle()
    {
        var article = await CreateAsync("Намаз");

        var lookup = await _service.GetContentBySlugAsync("NAMAZ", includeUnpublished: true);

        lookup.Content!.Id.Should().Be(article.Id);
    }

    [Fact]
    public async Task GivenRelatedLink_WhenReading_ThenItCarriesTheRelatedArticleSlug()
    {
        var related = await CreateAsync("Пост");
        var article = await CreateAsync("Намаз");

        var (success, _) = await UpdateAsync(article with
        {
            RelatedLinks = [new ArticleRelatedLinkDto(0, related.Id, related.Title, 1)],
        });
        success.Should().BeTrue();

        var reloaded = await _service.GetContentByArticleIdAsync(article.Id, includeUnpublished: true);
        reloaded.RelatedLinks!.Single().RelatedArticleSlug.Should().Be("post");
    }
}
