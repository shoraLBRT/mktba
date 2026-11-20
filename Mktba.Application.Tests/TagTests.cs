using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;
using Mktba.Infrastructure.UnitOfWork;
using NSubstitute;

namespace Mktba.Application.Tests;

/// <summary>M-06 (#70): tags as an entity — saved from the article, the tag page, rename and merge.</summary>
public class TagTests : IDisposable
{
    private static readonly DateTime Start = new(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc);

    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly ArticleContentService _content;
    private readonly ArticleRevisionService _revisions;
    private readonly TagService _tags;

    public TagTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        var articleRepo = new ArticleRepository(_context);
        var tagRepo = new TagRepository(_context);
        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync().Returns(_ => _context.SaveChangesAsync());
        _content = new ArticleContentService(articleRepo, new ParagraphRepository(_context), uow, tagRepo, TimeProvider.System);
        _revisions = new ArticleRevisionService(articleRepo, _content);
        _tags = new TagService(tagRepo, articleRepo, uow);
    }

    public void Dispose() => _context.Dispose();

    private async Task<int> CreateAsync(string title, List<string>? tags, string locale = "ru", bool publish = true, int day = 0)
    {
        var created = await _content.CreateArticleWithContentAsync(new ArticleContentCreateDto(
            title,
            null,
            [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
            null,
            null,
            tags,
            null,
            Locale: locale), authorId: null);
        if (publish)
        {
            var article = await _context.Articles.SingleAsync(a => a.Id == created.Id);
            article.Status = ArticleStatus.Published;
            article.PublishedAt = Start.AddDays(day);
            await _context.SaveChangesAsync();
        }

        _context.ChangeTracker.Clear();
        return created.Id;
    }

    private async Task<ArticleContentDto> ReadAsync(int id)
    {
        _context.ChangeTracker.Clear();
        return await _content.GetContentByArticleIdAsync(id, TestViewers.Admin);
    }

    private async Task<(bool Success, AppError? Error)> SaveTagsAsync(int id, List<string> tags)
    {
        var current = await ReadAsync(id);
        var result = await _content.UpdateContentAsync(id, current with { Tags = tags }, authorId: null);
        _context.ChangeTracker.Clear();
        return result;
    }

    private Task<Tag> TagAsync(string slug, string locale = "ru")
        => _context.Tags.AsNoTracking().SingleAsync(t => t.Slug == slug && t.Locale == locale);

    private Task<string?> SearchTextAsync(int id)
        => _context.Articles.AsNoTracking().Where(a => a.Id == id).Select(a => a.TagsSearchText).SingleAsync();

    [Fact]
    public async Task GivenTagNames_WhenArticlesAreSaved_ThenOneTagPerNameAndLanguageIsReusedIgnoringCase()
    {
        var first = await CreateAsync("Намаз", ["  Фикх ", "намаз  совершение", "фикх", ""]);
        var second = await CreateAsync("Пост", ["ФИКХ", "Ёлка"]);
        var english = await CreateAsync("Prayer", ["Фикх"], "en");
        await SaveTagsAsync(second, ["фикх", "елка", "Пост"]);

        var content = await ReadAsync(first);
        content.Tags.Should().Equal("Фикх", "намаз совершение");
        content.TagLinks.Should().Equal(new ArticleTagDto("Фикх", "fikkh"), new ArticleTagDto("намаз совершение", "namaz-sovershenie"));
        (await ReadAsync(second)).Tags.Should().Equal("Фикх", "Ёлка", "Пост");
        (await ReadAsync(english)).TagLinks.Should().Equal(new ArticleTagDto("Фикх", "fikkh"));
        (await _context.Tags.CountAsync()).Should().Be(5);
        (await SearchTextAsync(second)).Should().Be("Фикх,Ёлка,Пост");
    }

    [Fact]
    public async Task GivenTwoNamesWithOneSlug_WhenSaved_ThenTheSecondTagGetsASuffix()
    {
        var id = await CreateAsync("Намаз", ["Фикх!", "фикх?"]);

        (await ReadAsync(id)).TagLinks.Should().Equal(new ArticleTagDto("Фикх!", "fikkh"), new ArticleTagDto("фикх?", "fikkh-2"));
    }

    [Fact]
    public async Task GivenInvalidTags_WhenSaved_ThenTheSaveFailsWithTheRuleBroken()
    {
        var id = await CreateAsync("Намаз", ["Фикх"]);

        (await SaveTagsAsync(id, ["а,б"])).Error!.Code.Should().Be("tag_name_invalid");
        (await SaveTagsAsync(id, [new string('а', TagRules.NameMaxLength + 1)])).Error!.Code.Should().Be("tag_name_too_long");
        (await SaveTagsAsync(id, Enumerable.Range(1, TagRules.MaxPerArticle + 1).Select(n => $"тег {n}").ToList()))
            .Error!.Code.Should().Be("article_too_many_tags");
        var create = () => CreateAsync("Пост", ["x\u0007"]);
        (await create.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("tag_name_invalid");
        (await ReadAsync(id)).Tags.Should().Equal("Фикх");
    }

    [Fact]
    public async Task GivenATagOnPublishedAndDraftArticles_WhenItsPageIsRead_ThenOnlyReadableArticlesAreListedNewestFirst()
    {
        var older = await CreateAsync("Старая", ["Фикх"], day: 1);
        var newer = await CreateAsync("Новая", ["фикх"], day: 2);
        await CreateAsync("Черновик", ["Фикх"], publish: false);
        await CreateAsync("English", ["Фикх"], "en", day: 3);

        var page = await _tags.GetPageAsync("FIKKH", null, 1, 20);

        page.Name.Should().Be("Фикх");
        page.Total.Should().Be(2);
        page.Items.Select(item => item.Id).Should().Equal(newer, older);
        (await _tags.GetPageAsync("fikkh", "en", 1, 20)).Items.Should().ContainSingle();
        (await _tags.GetPageAsync("fikkh", null, 2, 1)).Items.Select(item => item.Id).Should().Equal(older);
    }

    [Fact]
    public async Task GivenATagOnlyOnDrafts_OrNoSuchTag_WhenItsPageIsRead_ThenNotFound()
    {
        await CreateAsync("Черновик", ["Скрытый"], publish: false);

        var draftsOnly = () => _tags.GetPageAsync("skrytyy", null, 1, 20);
        var missing = () => _tags.GetPageAsync("net-takogo", null, 1, 20);
        var badLocale = () => _tags.GetPageAsync("skrytyy", "xx", 1, 20);

        (await draftsOnly.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("tag_not_found");
        (await missing.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("tag_not_found");
        (await badLocale.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("locale_unsupported");
    }

    [Fact]
    public async Task GivenATag_WhenRenamed_ThenEveryArticleShowsTheNewNameAndTheSlugChangesOnlyWhenGiven()
    {
        var id = await CreateAsync("Намаз", ["Фикх", "Намаз"]);
        var tag = await TagAsync("fikkh");
        var updatedAt = (await ReadAsync(id)).UpdatedAt;
        var revisions = await _context.ArticleRevisions.CountAsync();

        var renamed = await _tags.RenameAsync(tag.Id, new TagRenameDto("  Исламское   право ", null));
        _context.ChangeTracker.Clear();
        var reslugged = await _tags.RenameAsync(tag.Id, new TagRenameDto("исламское право", " Fiqh "));

        renamed.Should().Be(new TagDto(tag.Id, "ru", "Исламское право", "fikkh", 1));
        reslugged.Slug.Should().Be("fiqh");
        (await ReadAsync(id)).TagLinks.Should().Equal(new ArticleTagDto("исламское право", "fiqh"), new ArticleTagDto("Намаз", "namaz"));
        (await SearchTextAsync(id)).Should().Be("исламское право,Намаз");
        (await ReadAsync(id)).UpdatedAt.Should().Be(updatedAt);
        (await _context.ArticleRevisions.CountAsync()).Should().Be(revisions);
    }

    [Fact]
    public async Task GivenAnotherTagsNameOrSlug_WhenRenaming_ThenRefused()
    {
        await CreateAsync("Намаз", ["Фикх", "Намаз"]);
        var fiqh = await TagAsync("fikkh");
        var namaz = await TagAsync("namaz");

        var nameTaken = () => _tags.RenameAsync(fiqh.Id, new TagRenameDto("НАМАЗ", null));
        var slugTaken = () => _tags.RenameAsync(fiqh.Id, new TagRenameDto("Фикх", "namaz"));
        var slugInvalid = () => _tags.RenameAsync(fiqh.Id, new TagRenameDto("Фикх", "123"));
        var blank = () => _tags.RenameAsync(fiqh.Id, new TagRenameDto("  ", null));
        var missing = () => _tags.RenameAsync(999, new TagRenameDto("Фикх", null));

        var taken = (await nameTaken.Should().ThrowAsync<ValidationException>()).Which.Error;
        taken.Code.Should().Be("tag_name_taken");
        taken.Params!["id"].Should().Be(namaz.Id);
        (await slugTaken.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("tag_slug_taken");
        (await slugInvalid.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("tag_slug_invalid");
        (await blank.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("tag_name_required");
        (await missing.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("tag_not_found");
    }

    [Fact]
    public async Task GivenTwoTags_WhenMerged_ThenArticlesCarryTheRemainingTagInPlaceAndTheMergedOneIsGone()
    {
        var onlyMerged = await CreateAsync("Первая", ["Намаз", "Фикх", "Пост"]);
        var both = await CreateAsync("Вторая", ["Право", "Намаз", "Фикх"]);
        var merged = await TagAsync("fikkh");
        var into = await TagAsync("pravo");

        var result = await _tags.MergeAsync(merged.Id, new TagMergeDto(into.Id));

        result.Should().Be(new TagDto(into.Id, "ru", "Право", "pravo", 2));
        (await ReadAsync(onlyMerged)).Tags.Should().Equal("Намаз", "Право", "Пост");
        (await ReadAsync(both)).Tags.Should().Equal("Право", "Намаз");
        (await SearchTextAsync(both)).Should().Be("Право,Намаз");
        (await _context.Tags.AnyAsync(t => t.Id == merged.Id)).Should().BeFalse();
        var page = () => _tags.GetPageAsync("fikkh", null, 1, 20);
        await page.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task GivenTagsOfTwoLanguagesOrTheSameTag_WhenMerging_ThenRefused()
    {
        await CreateAsync("Намаз", ["Фикх"]);
        await CreateAsync("Prayer", ["Fiqh"], "en");
        var russian = await TagAsync("fikkh");
        var english = await TagAsync("fiqh", "en");

        var acrossLanguages = () => _tags.MergeAsync(russian.Id, new TagMergeDto(english.Id));
        var intoItself = () => _tags.MergeAsync(russian.Id, new TagMergeDto(russian.Id));
        var intoMissing = () => _tags.MergeAsync(russian.Id, new TagMergeDto(999));

        (await acrossLanguages.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("tag_merge_locale_mismatch");
        (await intoItself.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("tag_merge_into_itself");
        (await intoMissing.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("tag_not_found");
    }

    [Fact]
    public async Task GivenARevisionWithOtherTags_WhenRestored_ThenTheTagsComeBackByName()
    {
        var id = await CreateAsync("Намаз", ["Фикх", "Намаз"], publish: false);
        await SaveTagsAsync(id, ["Пост"]);

        await _revisions.RestoreAsync(id, 1, comment: null, authorId: null);

        (await ReadAsync(id)).Tags.Should().Equal("Фикх", "Намаз");
    }

    [Fact]
    public async Task GivenTags_WhenListedForTheAdmin_ThenEachLanguageByNameWithArticleCounts()
    {
        await CreateAsync("Намаз", ["Фикх", "Намаз"]);
        await CreateAsync("Черновик", ["фикх"], publish: false);
        await CreateAsync("Prayer", ["Salah"], "en");

        var all = await _tags.ListAsync(null);
        var russian = await _tags.ListAsync("ru");

        all.Select(t => (t.Locale, t.Name, t.ArticleCount)).Should().Equal(("en", "Salah", 1), ("ru", "Намаз", 1), ("ru", "Фикх", 2));
        russian.Select(t => t.Name).Should().Equal("Намаз", "Фикх");
    }
}
