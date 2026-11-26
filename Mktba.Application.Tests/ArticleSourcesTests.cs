using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>
/// M-07 (#71): the directory of sources, citations on opinions, and how revisions carry them. Run
/// against a real PostgreSQL (<see cref="PostgresDatabaseFixture"/>): the full-replace save of
/// opinions and the Restrict foreign key behave differently on the InMemory provider. The tests
/// share one database, so each one uses titles of its own.
/// </summary>
public class ArticleSourcesTests : IClassFixture<PostgresDatabaseFixture>
{
    private readonly PostgresDatabaseFixture _database;

    public ArticleSourcesTests(PostgresDatabaseFixture database)
    {
        _database = database;
    }

    [Fact]
    public async Task GivenOpinionsWithCitations_WhenArticleIsCreated_ThenContentCarriesThemInOrderAndEachSourceOnce()
    {
        var bukhari = await AddSourceAsync(SourceKind.HadithCollection, "Сахих (создание)", "аль-Бухари");
        var quran = await AddSourceAsync(SourceKind.Quran, "Коран (создание)");

        var created = await CreateArticleAsync("Создание с источниками",
            Paragraph(1, Opinion("Первый", true, new(quran.Id, "  2:255 "), new(bukhari.Id, "№ 1"))),
            Paragraph(2, Opinion("Второй", true, new(bukhari.Id, "№ 52"), new(bukhari.Id, " "))));

        created.Paragraphs[0].Opinions[0].Sources.Should().Equal(new OpinionSourceDto(quran.Id, "2:255"), new OpinionSourceDto(bukhari.Id, "№ 1"));
        created.Paragraphs[1].Opinions[0].Sources.Should().Equal(new OpinionSourceDto(bukhari.Id, "№ 52"), new OpinionSourceDto(bukhari.Id, null));
        created.Sources.Should().Equal(quran, bukhari);
    }

    [Fact]
    public async Task GivenSavedCitations_WhenArticleIsSavedAgainWithTheSameOpinionIds_ThenCitationsAreReplacedNotAccumulated()
    {
        var first = await AddSourceAsync(SourceKind.Book, "Книга А (замена)");
        var second = await AddSourceAsync(SourceKind.Book, "Книга Б (замена)");
        var created = await CreateArticleAsync("Замена источников", Paragraph(1, Opinion("Текст", true, Cite(first.Id, "с. 10"))));

        created.Paragraphs[0].Opinions[0].Sources = [new(second.Id, "с. 20"), new(first.Id, "с. 11")];
        await UpdateAsync(created);
        var saved = await ReadAsync(created.Id);
        await UpdateAsync(saved);

        var reread = await ReadAsync(created.Id);
        reread.Paragraphs[0].Opinions[0].Sources.Should().Equal(new OpinionSourceDto(second.Id, "с. 20"), new OpinionSourceDto(first.Id, "с. 11"));
        reread.Sources.Should().Equal(second, first);
        await using var context = _database.CreateContext();
        var opinionIds = await context.Opinions.Where(o => o.Paragraph.ArticleId == created.Id).Select(o => o.Id).ToListAsync();
        (await context.OpinionSources.CountAsync(c => opinionIds.Contains(c.OpinionId))).Should().Be(2);
    }

    [Fact]
    public async Task GivenUnknownSourceId_WhenSaving_ThenItIsRejectedWithSourceNotFound()
    {
        var create = () => CreateArticleAsync("Нет источника", Paragraph(1, Opinion("Текст", true, Cite(987654, null))));

        (await create.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("source_not_found");

        var created = await CreateArticleAsync("Нет источника при правке", Paragraph(1, Opinion("Текст", true)));
        created.Paragraphs[0].Opinions[0].Sources = [new(987654, null)];
        var (success, error) = await UpdateRawAsync(created);

        success.Should().BeFalse();
        error!.Code.Should().Be("source_not_found");
        error.Params!["id"].Should().Be(987654);
    }

    [Fact]
    public async Task GivenTooLongLocator_WhenSaving_ThenItIsRejected()
    {
        var source = await AddSourceAsync(SourceKind.Book, "Книга (локатор)");

        var create = () => CreateArticleAsync("Длинный локатор", Paragraph(1, Opinion("Текст", true, Cite(source.Id, new string('1', 201)))));

        (await create.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("source_locator_too_long");
    }

    [Fact]
    public async Task GivenRevisionWithCitation_WhenSourceIsEditedLater_ThenRevisionKeepsItsCopyAndRestoreLinksTheCurrentEntry()
    {
        var source = await AddSourceAsync(SourceKind.Book, "Старое название (ревизия)", "Автор");
        var created = await CreateArticleAsync("Ревизия с источником", Paragraph(1, Opinion("Текст", true, Cite(source.Id, "с. 5"))));
        created.Paragraphs[0].Opinions[0].Sources = [];
        await UpdateAsync(created);
        await WithSourcesAsync(service => service.UpdateAsync(source.Id, new SourceWriteDto(SourceKind.Book, "Новое название (ревизия)", "Автор", null, null)));

        var revision = await WithRevisionsAsync(service => service.GetAsync(created.Id, 1, TestViewers.Admin));
        await WithRevisionsAsync(service => service.RestoreAsync(created.Id, 1, null, null, TestViewers.Admin));

        revision.Snapshot.SchemaVersion.Should().Be(ArticleSnapshotDto.CurrentSchemaVersion);
        revision.Snapshot.Paragraphs[0].Opinions[0].Sources.Should().Equal(
            new ArticleSnapshotSourceDto(source.Id, "с. 5", SourceKind.Book, "Старое название (ревизия)", "Автор", null, null));
        var restored = await ReadAsync(created.Id);
        restored.Paragraphs[0].Opinions[0].Sources.Should().Equal(new OpinionSourceDto(source.Id, "с. 5"));
        restored.Sources!.Single().Title.Should().Be("Новое название (ревизия)");
    }

    [Fact]
    public async Task GivenRevisionCitingSourceDeletedSince_WhenRestored_ThenThatCitationIsLeftOut()
    {
        var kept = await AddSourceAsync(SourceKind.Book, "Останется (откат)");
        var deleted = await AddSourceAsync(SourceKind.Book, "Будет удалён (откат)");
        var created = await CreateArticleAsync("Откат без источника",
            Paragraph(1, Opinion("Текст", true, new(deleted.Id, "с. 1"), new(kept.Id, "с. 2"))));
        created.Paragraphs[0].Opinions[0].Sources = [];
        await UpdateAsync(created);
        await DeleteSourceAsync(deleted.Id);

        await WithRevisionsAsync(service => service.RestoreAsync(created.Id, 1, null, null, TestViewers.Admin));

        var restored = await ReadAsync(created.Id);
        restored.Paragraphs[0].Opinions[0].Sources.Should().Equal(new OpinionSourceDto(kept.Id, "с. 2"));
        var old = await WithRevisionsAsync(service => service.GetAsync(created.Id, 1, TestViewers.Admin));
        old.Snapshot.Paragraphs[0].Opinions[0].Sources!.Select(s => s.Title).Should().Equal("Будет удалён (откат)", "Останется (откат)");
    }

    [Fact]
    public async Task GivenVersionTwoSnapshotWithoutSources_WhenReadAndRestored_ThenOpinionsHaveNoCitations()
    {
        var source = await AddSourceAsync(SourceKind.Book, "Книга (вторая версия)");
        var created = await CreateArticleAsync("Старый снимок", Paragraph(1, Opinion("Новый текст", true, Cite(source.Id, null))));
        await using (var context = _database.CreateContext())
        {
            var revision = await context.ArticleRevisions.SingleAsync(r => r.ArticleId == created.Id);
            revision.Snapshot = $$"""
                {"schemaVersion":2,"title":"Старый снимок","slug":"{{created.Slug}}","summary":null,"tags":[],"infobox":null,
                 "paragraphs":[{"order":1,"opinions":[{"content":"Старый текст","isDefault":true,"schoolIds":[]}]}],
                 "relatedLinks":[],"seo":{"title":null,"description":null,"socialImageUrl":null,"noIndex":false} }
                """;
            await context.SaveChangesAsync();
        }

        var old = await WithRevisionsAsync(service => service.GetAsync(created.Id, 1, TestViewers.Admin));
        await WithRevisionsAsync(service => service.RestoreAsync(created.Id, 1, null, null, TestViewers.Admin));

        old.Snapshot.Paragraphs[0].Opinions[0].Sources.Should().BeNull();
        var restored = await ReadAsync(created.Id);
        restored.Paragraphs[0].Opinions[0].Content.Should().Be("Старый текст");
        restored.Paragraphs[0].Opinions[0].Sources.Should().BeEmpty();
        restored.Sources.Should().BeEmpty();
    }

    [Fact]
    public async Task GivenSourceFields_WhenCreated_ThenTheyAreTrimmedAndBlankOnesBecomeNull()
    {
        var created = await WithSourcesAsync(service => service.CreateAsync(
            new SourceWriteDto(SourceKind.Other, "  Фетва (поля)  ", "  ", " Каир, 1990 ", " https://example.com/fatwa ")));

        created.Should().Be(new SourceDto(created.Id, SourceKind.Other, "Фетва (поля)", null, "Каир, 1990", "https://example.com/fatwa"));
    }

    [Theory]
    [InlineData("", null, null, "source_title_required")]
    [InlineData("Название (проверка)", null, "ftp://example.com/a", "source_url_invalid")]
    [InlineData("Название (проверка)", null, "/relative", "source_url_invalid")]
    [InlineData("Название (проверка)", "long", null, "source_field_too_long")]
    public async Task GivenInvalidSource_WhenCreated_ThenItIsRejectedWithItsCode(string title, string? author, string? url, string code)
    {
        var dto = new SourceWriteDto(SourceKind.Book, title, author == "long" ? new string('а', 201) : author, null, url);

        var create = () => WithSourcesAsync(service => service.CreateAsync(dto));

        (await create.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be(code);
    }

    [Fact]
    public async Task GivenSameKindTitleAndAuthorInAnotherCase_WhenCreated_ThenItIsRejectedAsDuplicateNamingTheExistingEntry()
    {
        var existing = await AddSourceAsync(SourceKind.Book, "Аль-Умм (дубль)", "аш-Шафии");

        var create = () => WithSourcesAsync(service => service.CreateAsync(new SourceWriteDto(SourceKind.Book, "аль-умм (ДУБЛЬ)", "Аш-Шафии", "другое издание", null)));
        var otherKind = await WithSourcesAsync(service => service.CreateAsync(new SourceWriteDto(SourceKind.Other, "Аль-Умм (дубль)", "аш-Шафии", null, null)));

        var error = (await create.Should().ThrowAsync<ValidationException>()).Which.Error;
        error.Code.Should().Be("source_duplicate");
        error.Params!["id"].Should().Be(existing.Id);
        otherKind.Id.Should().NotBe(existing.Id);
    }

    [Fact]
    public async Task GivenCitedSource_WhenDeleted_ThenItIsRefusedUntilTheCitationIsRemoved()
    {
        var source = await AddSourceAsync(SourceKind.Book, "Книга (удаление)");
        var created = await CreateArticleAsync("Удаление источника", Paragraph(1, Opinion("Текст", true, Cite(source.Id, null))));

        var delete = () => DeleteSourceAsync(source.Id);

        var error = (await delete.Should().ThrowAsync<ValidationException>()).Which.Error;
        error.Code.Should().Be("source_in_use");
        error.Params!["count"].Should().Be(1);

        created.Paragraphs[0].Opinions[0].Sources = [];
        await UpdateAsync(created);
        await delete();
        (await WithSourcesAsync(service => service.SearchAsync("Книга (удаление)", null, 10))).Should().BeEmpty();
    }

    [Fact]
    public async Task GivenDirectory_WhenSearched_ThenTitleAndAuthorMatchIgnoringCaseAndKindFilters()
    {
        var byTitle = await AddSourceAsync(SourceKind.Book, "Поисковый Трактат");
        var byAuthor = await AddSourceAsync(SourceKind.HadithCollection, "Сборник (поиск)", "Имам ПОИСКОВЫЙ");
        await AddSourceAsync(SourceKind.Book, "Совсем другое (поиск)");

        var both = await WithSourcesAsync(service => service.SearchAsync(" поисковый ", null, 10));
        var hadithOnly = await WithSourcesAsync(service => service.SearchAsync("поисковый", SourceKind.HadithCollection, 10));

        both.Should().BeEquivalentTo([byTitle, byAuthor]);
        hadithOnly.Should().Equal(byAuthor);
    }

    private static ParagraphCreateDto Paragraph(int order, params OpinionCreateDto[] opinions)
        => new() { Order = order, Opinions = opinions.ToList() };

    private static OpinionCreateDto Opinion(string content, bool isDefault, params OpinionSourceDto[] sources)
        => new(content, isDefault, [], sources.ToList());

    private static OpinionSourceDto Cite(int sourceId, string? locator) => new(sourceId, locator);

    private async Task DeleteSourceAsync(int id)
    {
        await using var context = _database.CreateContext();
        await new SourceService(new SourceRepository(context)).DeleteAsync(id);
    }

    private Task<SourceDto> AddSourceAsync(SourceKind kind, string title, string? author = null)
        => WithSourcesAsync(service => service.CreateAsync(new SourceWriteDto(kind, title, author, null, null)));

    private async Task<T> WithSourcesAsync<T>(Func<SourceService, Task<T>> action)
    {
        await using var context = _database.CreateContext();
        return await action(new SourceService(new SourceRepository(context)));
    }

    private async Task<T> WithRevisionsAsync<T>(Func<ArticleRevisionService, Task<T>> action)
    {
        await using var context = _database.CreateContext();
        var articles = new ArticleRepository(context);
        return await action(new ArticleRevisionService(articles, Content(context)));
    }

    private static ArticleContentService Content(MktbaDbContext context)
        => new(new ArticleRepository(context), new ParagraphRepository(context), new Infrastructure.UnitOfWork.UnitOfWork(context), new TagRepository(context), new ArticleDraftRepository(context), TimeProvider.System);

    private async Task<ArticleContentDto> CreateArticleAsync(string title, params ParagraphCreateDto[] paragraphs)
    {
        await using var context = _database.CreateContext();
        return await Content(context).CreateArticleWithContentAsync(
            new ArticleContentCreateDto(title, null, paragraphs.ToList(), null, null, null, null), authorId: null);
    }

    private async Task<ArticleContentDto> ReadAsync(int articleId)
    {
        await using var context = _database.CreateContext();
        return await Content(context).GetContentByArticleIdAsync(articleId, TestViewers.Admin);
    }

    private async Task<(bool Success, AppError? Error)> UpdateRawAsync(ArticleContentDto article)
    {
        await using var context = _database.CreateContext();
        return await Content(context).UpdateContentAsync(article.Id, article, authorId: null);
    }

    private async Task UpdateAsync(ArticleContentDto article)
    {
        var (success, error) = await UpdateRawAsync(article);
        success.Should().BeTrue(error?.Code);
    }
}
