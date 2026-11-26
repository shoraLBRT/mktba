using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Application.Services.Verification;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>V-06 (#122): a scholar's remark on a block, answered and closed by the article's authors.</summary>
public sealed class ArticleRemarkTests : IDisposable
{
    private static readonly DateTime Now = new(2026, 11, 26, 10, 0, 0, DateTimeKind.Utc);

    private readonly MktbaDbContext _db;
    private readonly FeedbackTests.FakeClock _clock = new(Now);

    public ArticleRemarkTests()
    {
        _db = new MktbaDbContext(new DbContextOptionsBuilder<MktbaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        _db.Database.EnsureCreated();
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task GivenVerifiedScholar_WhenTheyRemarkOnAParagraph_ThenTheThreadAndItsAuditEntryAreStoredAndOnlyTheParticipantsSeeIt()
    {
        var scholarId = await ScholarAsync();
        var authorId = await UserAsync(UserRole.Author);
        var article = await ArticleAsync(authorId);

        var remark = await Service().CreateAsync(
            article.Id, scholarId, new ArticleRemarkCreateDto(1, article.PlainId, null, "  Нужен источник.\r\nСм. «Хидаю».  "), default);

        (remark.RevisionNumber, remark.ParagraphId, remark.OpinionId, remark.OnOpinion, remark.ParagraphOrder, remark.Status)
            .Should().Be((1, (int?)article.PlainId, (int?)null, false, 1, ArticleRemarkStatus.Open));
        remark.Excerpt.Should().Be("Путник сокращает намаз & не постится.");
        (remark.BlockRemoved, remark.IsMine, remark.CanReply, remark.CanClose, remark.CanReopen).Should().Be((false, true, true, false, false));
        remark.Messages.Should().ContainSingle().Which.Should().Match<ArticleRemarkMessageDto>(message =>
            message.Body == "Нужен источник.\nСм. «Хидаю»." && message.Participant == ArticleRemarkParticipant.Scholar && message.IsMine);
        var entry = await _db.AuditLogEntries.AsNoTracking().SingleAsync();
        (entry.Action, entry.ActorId, entry.ArticleId, entry.ArticleTitle, entry.TargetUserId)
            .Should().Be((AuditAction.ArticleRemarkCreated, (int?)scholarId, (int?)article.Id, "Намаз путника", (int?)null));

        var forAuthor = await Service().ListAsync(article.Id, authorId, default);
        forAuthor.CanCreate.Should().BeFalse();
        forAuthor.Items.Should().ContainSingle().Which.Should().Match<ArticleRemarkDto>(item => item.CanClose && item.CanReply && !item.IsMine);
        (await Service().ListAsync(article.Id, await AdminAsync(), default)).Items.Should().ContainSingle();
        var otherScholar = await Service().ListAsync(article.Id, await ScholarAsync(), default);
        (otherScholar.CanCreate, otherScholar.Items.Count).Should().Be((true, 0));
        var reader = () => Service().ListAsync(article.Id, UserAsync(UserRole.Reader).Result, default);
        (await reader.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("article_not_found");
        var otherAuthor = () => Service().ListAsync(article.Id, UserAsync(UserRole.Author).Result, default);
        await otherAuthor.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task GivenABlockOfOpinions_WhenTheScholarRemarksOnOneOpinion_ThenTheRemarkKeepsThatOpinionAndItsText()
    {
        var scholarId = await ScholarAsync();
        var article = await ArticleAsync(await UserAsync(UserRole.Author));

        var remark = await Service().CreateAsync(
            article.Id, scholarId, new ArticleRemarkCreateDto(1, article.BlockId, article.ShafiiOpinionId, "Это мнение спорно."), default);

        (remark.ParagraphId, remark.OpinionId, remark.OnOpinion, remark.ParagraphOrder, remark.Excerpt)
            .Should().Be(((int?)article.BlockId, (int?)article.ShafiiOpinionId, true, 2, "Шафииты: желательно."));
        var wholeBlock = await Service().CreateAsync(article.Id, scholarId, new ArticleRemarkCreateDto(1, article.BlockId, null, "Весь блок."), default);
        wholeBlock.Excerpt.Should().Be("Ханафиты: обязательно. · Шафииты: желательно.");
    }

    [Theory]
    [InlineData("plain-with-opinion")]
    [InlineData("unknown-paragraph")]
    [InlineData("opinion-of-another-block")]
    public async Task GivenABlockTheRevisionDoesNotHave_WhenTheScholarRemarksOnIt_ThenItIsRejected(string block)
    {
        var scholarId = await ScholarAsync();
        var article = await ArticleAsync(await UserAsync(UserRole.Author));
        var dto = block switch
        {
            "plain-with-opinion" => new ArticleRemarkCreateDto(1, article.PlainId, article.PlainOpinionId, "Текст"),
            "unknown-paragraph" => new ArticleRemarkCreateDto(1, 987654, null, "Текст"),
            _ => new ArticleRemarkCreateDto(1, article.PlainId, article.ShafiiOpinionId, "Текст"),
        };

        var create = () => Service().CreateAsync(article.Id, scholarId, dto, default);

        (await create.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_remark_block_invalid");
    }

    [Fact]
    public async Task GivenWhatAReviewRefuses_WhenTheScholarRemarks_ThenTheRemarkIsRefusedTheSameWay()
    {
        var scholarId = await ScholarAsync();
        var article = await ArticleAsync(await UserAsync(UserRole.Author));
        await AddRevisionAsync(article, 2);
        var draft = await ArticleAsync(await UserAsync(UserRole.Author), ArticleStatus.Draft);

        var outdated = () => Service().CreateAsync(article.Id, scholarId, new ArticleRemarkCreateDto(1, article.PlainId, null, "Текст"), default);
        var unverified = async () => await Service().CreateAsync(
            article.Id, await UserAsync(UserRole.Scholar), new ArticleRemarkCreateDto(2, article.PlainId, null, "Текст"), default);
        var unpublished = () => Service().CreateAsync(draft.Id, scholarId, new ArticleRemarkCreateDto(1, draft.PlainId, null, "Текст"), default);
        var empty = () => Service().CreateAsync(article.Id, scholarId, new ArticleRemarkCreateDto(2, article.PlainId, null, "  "), default);
        var tooLong = () => Service().CreateAsync(
            article.Id, scholarId, new ArticleRemarkCreateDto(2, article.PlainId, null, new string('а', ArticleRemark.MessageMaxLength + 1)), default);

        (await outdated.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("article_review_revision_outdated");
        (await unverified.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("article_review_not_verified_scholar");
        (await unpublished.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("article_not_found");
        (await empty.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_remark_body_required");
        (await tooLong.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_remark_body_too_long");
        (await _db.ArticleRemarks.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task GivenAnOpenRemark_WhenTheAuthorRepliesAndResolvesIt_ThenTheThreadIsClosedAndOnlyTheScholarOrAnEditorReopensIt()
    {
        var scholarId = await ScholarAsync();
        var authorId = await UserAsync(UserRole.Author);
        var coAuthorId = await UserAsync(UserRole.Author);
        var adminId = await AdminAsync();
        var article = await ArticleAsync(authorId, coAuthorId: coAuthorId);
        await NameAsync(authorId, "Автор статьи");
        var remark = await Service().CreateAsync(article.Id, scholarId, new ArticleRemarkCreateDto(1, article.PlainId, null, "Неточно."), default);
        _clock.Advance(TimeSpan.FromHours(1));

        await Service().ReplyAsync(remark.Id, authorId, new ArticleRemarkReplyDto("Поправлю."), default);
        await Service().ReplyAsync(remark.Id, adminId, new ArticleRemarkReplyDto("Согласен."), default);
        var scholarClose = () => Service().CloseAsync(remark.Id, scholarId, new ArticleRemarkCloseDto(ArticleRemarkStatus.Resolved, null), default);
        (await scholarClose.Should().ThrowAsync<ForbiddenException>()).Which.Error.Code.Should().Be("forbidden");
        var invalid = () => Service().CloseAsync(remark.Id, coAuthorId, new ArticleRemarkCloseDto(ArticleRemarkStatus.Open, null), default);
        (await invalid.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_remark_outcome_invalid");
        var closed = await Service().CloseAsync(remark.Id, coAuthorId, new ArticleRemarkCloseDto(ArticleRemarkStatus.Resolved, "Исправлено в ревизии 2."), default);

        (closed.Status, closed.ClosedAt, closed.CanReply, closed.CanClose, closed.CanReopen, closed.UpdatedAt)
            .Should().Be((ArticleRemarkStatus.Resolved, (DateTime?)Now.AddHours(1), false, false, false, Now.AddHours(1)));
        closed.Messages.Select(message => (message.AuthorName, message.Participant, message.Body)).Should().Equal(
            (null, ArticleRemarkParticipant.Scholar, "Неточно."),
            ("Автор статьи", ArticleRemarkParticipant.Author, "Поправлю."),
            (null, ArticleRemarkParticipant.Editor, "Согласен."),
            (null, ArticleRemarkParticipant.Author, "Исправлено в ревизии 2."));
        var reply = () => Service().ReplyAsync(remark.Id, scholarId, new ArticleRemarkReplyDto("Ещё"), default);
        (await reply.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("article_remark_closed");
        var closeAgain = () => Service().CloseAsync(remark.Id, authorId, new ArticleRemarkCloseDto(ArticleRemarkStatus.Closed, null), default);
        (await closeAgain.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("article_remark_closed");
        var authorReopen = () => Service().ReopenAsync(remark.Id, authorId, new ArticleRemarkReopenDto(null), default);
        await authorReopen.Should().ThrowAsync<ForbiddenException>();

        var forScholar = (await Service().ListAsync(article.Id, scholarId, default)).Items.Single();
        forScholar.CanReopen.Should().BeTrue();
        var reopened = await Service().ReopenAsync(remark.Id, scholarId, new ArticleRemarkReopenDto("  "), default);

        (reopened.Status, reopened.ClosedAt, reopened.Messages.Count, reopened.CanReply).Should().Be((ArticleRemarkStatus.Open, (DateTime?)null, 4, true));
        var reopenAgain = () => Service().ReopenAsync(remark.Id, scholarId, new ArticleRemarkReopenDto(null), default);
        (await reopenAgain.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("article_remark_open");
        var entries = await _db.AuditLogEntries.AsNoTracking().OrderBy(e => e.Id).ToListAsync();
        entries.Select(e => (e.Action, e.ActorId, e.FromValue, e.ToValue)).Should().Equal(
            (AuditAction.ArticleRemarkCreated, scholarId, null, null),
            (AuditAction.ArticleRemarkClosed, coAuthorId, null, "Resolved"),
            (AuditAction.ArticleRemarkReopened, scholarId, "Resolved", null));
    }

    [Fact]
    public async Task GivenAScholarWhoseStatusWasRevoked_WhenTheyActOnTheirRemark_ThenTheySeeItButCannotReplyOrReopen()
    {
        var scholarId = await ScholarAsync();
        var article = await ArticleAsync(await UserAsync(UserRole.Author));
        var remark = await Service().CreateAsync(article.Id, scholarId, new ArticleRemarkCreateDto(1, article.PlainId, null, "Неточно."), default);
        var application = await _db.ScholarApplications.SingleAsync(a => a.UserId == scholarId);
        application.Status = ScholarApplicationStatus.Revoked;
        await _db.SaveChangesAsync();

        var seen = (await Service().ListAsync(article.Id, scholarId, default)).Items.Single();
        var reply = () => Service().ReplyAsync(remark.Id, scholarId, new ArticleRemarkReplyDto("Ещё"), default);

        (seen.CanReply, seen.CanReopen).Should().Be((false, false));
        (await reply.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("article_review_not_verified_scholar");
        var stranger = () => Service().ReplyAsync(remark.Id, ScholarAsync().Result, new ArticleRemarkReplyDto("Чужое"), default);
        (await stranger.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("article_remark_not_found");
    }

    [Fact]
    public async Task GivenARemarkedBlock_WhenItIsDeleted_ThenTheRemarkStaysWithItsExcerptAsBlockRemoved()
    {
        var scholarId = await ScholarAsync();
        var authorId = await UserAsync(UserRole.Author);
        var article = await ArticleAsync(authorId);
        await Service().CreateAsync(article.Id, scholarId, new ArticleRemarkCreateDto(1, article.BlockId, article.ShafiiOpinionId, "Спорно."), default);
        await Service().CreateAsync(article.Id, scholarId, new ArticleRemarkCreateDto(1, article.PlainId, null, "Неточно."), default);

        _db.Opinions.Remove(await _db.Opinions.SingleAsync(o => o.Id == article.ShafiiOpinionId));
        _db.Paragraphs.Remove(await _db.Paragraphs.SingleAsync(p => p.Id == article.PlainId));
        await _db.SaveChangesAsync();
        _db.ChangeTracker.Clear();

        var items = (await Service().ListAsync(article.Id, authorId, default)).Items;
        items.Select(item => (item.OnOpinion, item.BlockRemoved, item.ParagraphId, item.OpinionId, item.CurrentParagraphOrder, item.Excerpt))
            .Should().BeEquivalentTo(new[]
            {
                (true, true, (int?)article.BlockId, (int?)null, (int?)2, "Шафииты: желательно."),
                (false, true, (int?)null, (int?)null, (int?)null, "Путник сокращает намаз & не постится."),
            });
    }

    [Fact]
    public async Task GivenASnapshotWithoutIds_WhenTheReviewPageIsRead_ThenItsBlocksTakeTheWorkingCopysIdsAndCanBeRemarkedOn()
    {
        var scholarId = await ScholarAsync();
        var article = await ArticleAsync(await UserAsync(UserRole.Author), snapshotIds: false);

        var context = await new ArticleReviewService(_db, _clock, new AuditLogRepository(_db)).GetAsync(article.Id, scholarId, default);
        var remark = await Service().CreateAsync(
            article.Id, scholarId, new ArticleRemarkCreateDto(1, article.BlockId, article.ShafiiOpinionId, "Спорно."), default);

        context.Revision.Snapshot.Paragraphs.Select(p => p.Id).Should().Equal(article.PlainId, article.BlockId);
        context.Revision.Snapshot.Paragraphs[1].Opinions.Select(o => o.Id).Should().Equal(article.HanafiOpinionId, article.ShafiiOpinionId);
        remark.OpinionId.Should().Be(article.ShafiiOpinionId);
    }

    [Fact]
    public void GivenRichText_WhenAnExcerptIsTaken_ThenItIsPlainCollapsedAndCut()
    {
        RemarkAnchors.Excerpt(["<p>Раз&nbsp;&nbsp; <b>два</b></p>\n<p>три</p>", "  "]).Should().Be("Раз два три");
        var excerpt = RemarkAnchors.Excerpt([new string('а', 400)]);
        (excerpt.Length, excerpt[^1]).Should().Be((ArticleRemark.ExcerptMaxLength, '…'));
    }

    private ArticleRemarkService Service() => new(_db, _clock, new AuditLogRepository(_db));

    private sealed record SeededArticle(int Id, int PlainId, int PlainOpinionId, int BlockId, int HanafiOpinionId, int ShafiiOpinionId, int Hanafi, int Shafii);

    private async Task NameAsync(int userId, string displayName)
    {
        var user = await _db.Users.SingleAsync(u => u.Id == userId);
        user.DisplayName = displayName;
        await _db.SaveChangesAsync();
    }

    private async Task<int> UserAsync(UserRole role)
    {
        var user = new User { Email = $"{Guid.NewGuid():N}@mktba.test", Role = role };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user.Id;
    }

    private Task<int> AdminAsync() => UserAsync(UserRole.Admin);

    private async Task<int> ScholarAsync()
    {
        var userId = await UserAsync(UserRole.Scholar);
        _db.ScholarApplications.Add(new ScholarApplication
        {
            UserId = userId,
            Degree = "Доктор наук",
            Institution = "Университет",
            Specialization = "Фикх",
            Status = ScholarApplicationStatus.Approved,
            SubmittedAt = Now,
            ClosedAt = Now,
            RoleBeforeApproval = UserRole.Reader,
        });
        await _db.SaveChangesAsync();
        return userId;
    }

    /// <summary>
    /// An article with a plain paragraph and a block of two opinions (Hanafi, Shafi'i) in the working
    /// copy, and revision 1 that matches it — with the blocks' ids unless <paramref name="snapshotIds"/> is false (before version 4).
    /// </summary>
    private async Task<SeededArticle> ArticleAsync(
        int authorId, ArticleStatus status = ArticleStatus.Published, int? coAuthorId = null, bool snapshotIds = true)
    {
        var hanafi = new School { Name = "Ханафиты", ShortName = "Ханафи", Slug = $"hanafi-{Guid.NewGuid():N}", IsSystem = true };
        var shafii = new School { Name = "Шафииты", ShortName = "Шафии", Slug = $"shafii-{Guid.NewGuid():N}", IsSystem = true };
        _db.Schools.AddRange(hanafi, shafii);
        var plain = new Paragraph { Order = 1, Opinions = [new Opinion { Content = "<p>Путник сокращает намаз &amp; не постится.</p>", IsDefault = true }] };
        var hanafiOpinion = new Opinion { Content = "<p>Ханафиты: обязательно.</p>", IsDefault = true };
        var shafiiOpinion = new Opinion { Content = "<p>Шафииты: желательно.</p>" };
        var block = new Paragraph { Order = 2, Opinions = [hanafiOpinion, shafiiOpinion] };
        var article = new Article
        {
            Title = "Намаз путника",
            Slug = $"a-{Guid.NewGuid():N}",
            Status = status,
            AuthorId = authorId,
            CreatedAt = Now,
            UpdatedAt = Now,
            Paragraphs = [plain, block],
        };
        _db.Articles.Add(article);
        await _db.SaveChangesAsync();
        hanafiOpinion.OpinionSchools.Add(new OpinionSchool { SchoolId = hanafi.Id });
        shafiiOpinion.OpinionSchools.Add(new OpinionSchool { SchoolId = shafii.Id });
        if (coAuthorId is int coAuthor)
        {
            _db.ArticleCoAuthors.Add(new ArticleCoAuthor { ArticleId = article.Id, UserId = coAuthor });
        }

        await _db.SaveChangesAsync();
        var seeded = new SeededArticle(
            article.Id, plain.Id, plain.Opinions.Single().Id, block.Id, hanafiOpinion.Id, shafiiOpinion.Id, hanafi.Id, shafii.Id);
        await AddRevisionAsync(seeded, 1, snapshotIds);
        return seeded;
    }

    private async Task AddRevisionAsync(SeededArticle article, int number, bool ids = true)
    {
        var paragraphs = await _db.Paragraphs.AsNoTracking()
            .Where(p => p.ArticleId == article.Id)
            .Include(p => p.Opinions).ThenInclude(o => o.OpinionSchools)
            .OrderBy(p => p.Order)
            .ToListAsync();
        var snapshot = new ArticleSnapshotDto(
            ArticleSnapshotDto.CurrentSchemaVersion, "Намаз путника", "slug", null, [], null,
            paragraphs.Select(p => new ArticleSnapshotParagraphDto(
                p.Order,
                p.Opinions.OrderBy(o => o.Id)
                    .Select(o => new ArticleSnapshotOpinionDto(o.Content, o.IsDefault, o.OpinionSchools.Select(s => s.SchoolId).ToList(), [], ids ? o.Id : null))
                    .ToList(),
                ids ? p.Id : null)).ToList(),
            []);
        _db.ArticleRevisions.Add(new ArticleRevision
        {
            ArticleId = article.Id,
            Number = number,
            CreatedAt = _clock.GetUtcNow().UtcDateTime,
            Snapshot = ArticleSnapshots.Serialize(snapshot),
        });
        await _db.SaveChangesAsync();
    }
}
