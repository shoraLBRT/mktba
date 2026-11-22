using AutoMapper;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
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

/// <summary>M-04 (#25): every content save is an immutable revision; history can be read, compared and rolled back.</summary>
public class ArticleRevisionTests : IDisposable
{
    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly ArticleContentService _content;
    private readonly ArticleRevisionService _revisions;
    private readonly ArticleService _articles;

    public ArticleRevisionTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        var articleRepo = new ArticleRepository(_context);
        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync().Returns(_ => _context.SaveChangesAsync());
        _content = new ArticleContentService(articleRepo, new ParagraphRepository(_context), uow, new TagRepository(_context), new ArticleDraftRepository(_context), TimeProvider.System);
        _revisions = new ArticleRevisionService(articleRepo, _content);
        var mapper = new MapperConfiguration(cfg => cfg.AddProfile<MappingProfile>(), NullLoggerFactory.Instance).CreateMapper();
        _articles = new ArticleService(articleRepo, mapper, TimeProvider.System, new RecordingSearchEngineNotifier(), new AuditLogRepository(_context));
    }

    public void Dispose() => _context.Dispose();

    private async Task<int> AddUserAsync(string email)
    {
        var user = new User { Email = email, PasswordHash = "hash" };
        _context.Users.Add(user);
        await _context.SaveChangesAsync();
        return user.Id;
    }

    private Task<ArticleContentDto> CreateAsync(int? authorId, string? comment = null) =>
        _content.CreateArticleWithContentAsync(new ArticleContentCreateDto(
            "Намаз",
            null,
            [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Первый текст", true, [])] }],
            null,
            null,
            ["фикх"],
            null,
            EditComment: comment), authorId);

    private async Task<ArticleContentDto> EditAsync(int articleId, string title, string text, int? authorId, string? comment = null)
    {
        _context.ChangeTracker.Clear();
        var current = await _content.GetContentByArticleIdAsync(articleId, TestViewers.Admin);
        var edited = current with
        {
            Title = title,
            Paragraphs = [new ParagraphDto { Order = 1, Opinions = [new OpinionDto { Content = text, IsDefault = true }] }],
            EditComment = comment,
        };
        var (success, error) = await _content.UpdateContentAsync(articleId, edited, authorId);
        success.Should().BeTrue(error?.Code);
        _context.ChangeTracker.Clear();
        return await _content.GetContentByArticleIdAsync(articleId, TestViewers.Admin);
    }

    [Fact]
    public async Task GivenNamedSavingUser_WhenAnAuthorOrAnAdminReadsTheRevision_ThenOnlyTheAdminGetsTheEmail()
    {
        var authorId = await AddUserAsync("named@example.com");
        var user = await _context.Users.SingleAsync(u => u.Id == authorId);
        user.DisplayName = "Абдуллах";
        await _context.SaveChangesAsync();
        var created = await CreateAsync(authorId);

        var asAuthor = await _revisions.GetAsync(created.Id, 1, TestViewers.Author(authorId));
        var asAdmin = await _revisions.GetAsync(created.Id, 1, TestViewers.Admin);

        asAuthor.Revision.AuthorDisplayName.Should().Be("Абдуллах");
        asAuthor.Revision.AuthorEmail.Should().BeNull();
        asAdmin.Revision.AuthorDisplayName.Should().Be("Абдуллах");
        asAdmin.Revision.AuthorEmail.Should().Be("named@example.com");
    }

    [Fact]
    public async Task CreateArticleWithContent_WritesRevisionOneWithAuthorCommentAndSnapshot()
    {
        var authorId = await AddUserAsync("author@example.com");

        var created = await CreateAsync(authorId, "  Первая версия  ");

        var revision = await _revisions.GetAsync(created.Id, 1, TestViewers.Admin);
        revision.Revision.AuthorId.Should().Be(authorId);
        revision.Revision.AuthorEmail.Should().Be("author@example.com");
        revision.Revision.AuthorDisplayName.Should().BeNull();
        revision.Revision.Comment.Should().Be("Первая версия");
        revision.Snapshot.SchemaVersion.Should().Be(ArticleSnapshotDto.CurrentSchemaVersion);
        revision.Snapshot.Title.Should().Be("Намаз");
        revision.Snapshot.Slug.Should().Be(created.Slug);
        revision.Snapshot.Tags.Should().Equal("фикх");
        revision.Snapshot.Paragraphs.Should().ContainSingle()
            .Which.Opinions.Should().ContainSingle().Which.Content.Should().Be("Первый текст");
    }

    [Fact]
    public async Task UpdateContent_WritesNextRevisionAndLeavesEarlierOnesUnchanged()
    {
        var created = await CreateAsync(authorId: null);
        var before = await _context.ArticleRevisions.AsNoTracking().SingleAsync();
        var editorId = await AddUserAsync("editor@example.com");

        await EditAsync(created.Id, "Намаз (правка)", "Второй текст", editorId, "Исправил текст");

        var list = await _revisions.ListAsync(created.Id, TestViewers.Admin);
        list.Select(r => r.Number).Should().Equal(2, 1);
        list[0].AuthorId.Should().Be(editorId);
        list[0].Comment.Should().Be("Исправил текст");
        var second = await _revisions.GetAsync(created.Id, 2, TestViewers.Admin);
        second.Snapshot.Title.Should().Be("Намаз (правка)");
        second.Snapshot.Paragraphs.Single().Opinions.Single().Content.Should().Be("Второй текст");

        var first = await _context.ArticleRevisions.AsNoTracking().SingleAsync(r => r.Number == 1);
        first.Should().BeEquivalentTo(before);
    }

    [Fact]
    public async Task UpdateContent_WhenEditCommentIsTooLong_FailsAndWritesNoRevision()
    {
        var created = await CreateAsync(authorId: null);
        _context.ChangeTracker.Clear();
        var current = await _content.GetContentByArticleIdAsync(created.Id, TestViewers.Admin);

        var (success, error) = await _content.UpdateContentAsync(
            created.Id, current with { EditComment = new string('x', 501) }, authorId: null);

        success.Should().BeFalse();
        error!.Code.Should().Be("revision_comment_too_long");
        (await _context.ArticleRevisions.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Restore_CopiesOldSnapshotIntoWorkingCopyAsNewRevision()
    {
        var created = await CreateAsync(authorId: null);
        await EditAsync(created.Id, "Другой заголовок", "Второй текст", authorId: null);
        var second = await _context.ArticleRevisions.AsNoTracking().SingleAsync(r => r.Number == 2);
        var restorerId = await AddUserAsync("restorer@example.com");
        _context.ChangeTracker.Clear();

        var restored = await _revisions.RestoreAsync(created.Id, 1, comment: null, restorerId, TestViewers.Admin);

        restored.Number.Should().Be(3);
        restored.AuthorId.Should().Be(restorerId);
        restored.Comment.Should().Be("Откат к ревизии 1");
        _context.ChangeTracker.Clear();
        var content = await _content.GetContentByArticleIdAsync(created.Id, TestViewers.Admin);
        content.Title.Should().Be("Намаз");
        content.Paragraphs.Single().Opinions.Single().Content.Should().Be("Первый текст");
        var third = await _revisions.GetAsync(created.Id, 3, TestViewers.Admin);
        third.Snapshot.Should().BeEquivalentTo((await _revisions.GetAsync(created.Id, 1, TestViewers.Admin)).Snapshot);
        (await _context.ArticleRevisions.AsNoTracking().SingleAsync(r => r.Number == 2)).Should().BeEquivalentTo(second);
    }

    [Fact]
    public async Task Restore_WhenRevisionDoesNotExist_ThrowsNotFound()
    {
        var created = await CreateAsync(authorId: null);

        var act = () => _revisions.RestoreAsync(created.Id, 7, comment: null, authorId: null, TestViewers.Admin);

        (await act.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("revision_not_found");
        (await _context.ArticleRevisions.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task ListRevisions_WhenArticleDoesNotExist_ThrowsNotFound()
    {
        var act = () => _revisions.ListAsync(404, TestViewers.Admin);

        (await act.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("article_not_found");
    }

    [Fact]
    public async Task Compare_ReturnsBothSnapshots()
    {
        var created = await CreateAsync(authorId: null);
        await EditAsync(created.Id, "Другой заголовок", "Второй текст", authorId: null);

        var comparison = await _revisions.CompareAsync(created.Id, 1, 2, TestViewers.Admin);

        comparison.From.Snapshot.Title.Should().Be("Намаз");
        comparison.To.Snapshot.Title.Should().Be("Другой заголовок");
    }

    [Fact]
    public async Task Publish_RecordsLatestRevisionAsPublished_AndLaterEditsDoNotMoveIt()
    {
        var created = await CreateAsync(authorId: null);
        await _articles.ChangeStatusAsync(created.Id, ArticleStatus.InReview, TestViewers.Admin);
        await _articles.ChangeStatusAsync(created.Id, ArticleStatus.Published, TestViewers.Admin);
        await EditAsync(created.Id, "Правка после публикации", "Второй текст", authorId: null);

        var list = await _revisions.ListAsync(created.Id, TestViewers.Admin);

        list.Single(r => r.IsPublished).Number.Should().Be(1);
    }

    [Fact]
    public void Deserialize_ReadsSnapshotInBackfillMigrationShape()
    {
        // The shape the AddArticleRevisions migration writes; jsonb reorders keys alphabetically.
        const string backfilled = """
            {"slug": "namaz", "tags": ["фикх"], "title": "Намаз",
             "infobox": {"title": "Инфо", "fields": [{"key": "k", "label": "Метка", "order": 1, "value": "Знач"}], "subtitle": null},
             "summary": null,
             "paragraphs": [{"order": 1, "opinions": [{"content": "Ханафи", "isDefault": true, "schoolIds": [1]}]}],
             "relatedLinks": [{"order": 1, "relatedArticleId": 2, "relatedArticleSlug": "post", "relatedArticleTitle": "Пост"}],
             "schemaVersion": 1}
            """;

        var snapshot = ArticleSnapshots.Deserialize(backfilled);

        snapshot.SchemaVersion.Should().Be(1);
        snapshot.Infobox!.Fields.Single().Label.Should().Be("Метка");
        snapshot.Paragraphs.Single().Opinions.Single().SchoolIds.Should().Equal(1);
        snapshot.RelatedLinks.Single().RelatedArticleSlug.Should().Be("post");
    }
}
