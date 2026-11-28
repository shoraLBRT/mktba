using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Comments;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Application.Tests;

/// <summary>C-02 (#128): comment moderation — premoderation of new readers, the spam filter, reports, hiding, bans.</summary>
public sealed class CommentModerationTests : IDisposable
{
    private static readonly DateTime Now = new(2026, 11, 28, 10, 0, 0, DateTimeKind.Utc);

    private readonly MktbaDbContext _db;
    private readonly FeedbackTests.FakeClock _clock = new(Now);
    private readonly CommentOptions _options = new() { PerUserLimit = 0, PremoderateFirst = 0, DuplicateWindowHours = 0, ReportsToHold = 0 };

    public CommentModerationTests()
    {
        _db = new MktbaDbContext(new DbContextOptionsBuilder<MktbaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        _db.Database.EnsureCreated();
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task GivenPremoderation_WhenANewReaderComments_ThenOnlyTheyOrTheModeratorSeeItUntilApprovedAndTheNextOneIsPublished()
    {
        _options.PremoderateFirst = 1;
        var articleId = await ArticleAsync();
        var reader = await UserAsync(name: "Новичок");
        var other = await UserAsync(name: "Другой");
        var author = await UserAsync(UserRole.Author, "Автор");
        var admin = await UserAsync(UserRole.Admin, "Админ");

        var held = await Comments().CreateAsync(articleId, reader, new("Первый", null, null), default);
        var byAuthor = await Comments().CreateAsync(articleId, author, new("От автора", null, null), default);

        held.IsPending.Should().BeTrue();
        byAuthor.IsPending.Should().BeFalse();
        var stored = await _db.ArticleComments.SingleAsync(c => c.Id == held.Id);
        (stored.Status, stored.HoldReason).Should().Be((ArticleCommentStatus.Pending, (ArticleCommentHoldReason?)ArticleCommentHoldReason.NewAuthor));
        var forOther = await Comments().ListAsync(articleId, other, 1, 20, default);
        forOther.Items.Select(item => item.Id).Should().Equal(byAuthor.Id);
        forOther.Total.Should().Be(1);
        var forReader = await Comments().ListAsync(articleId, reader, 1, 20, default);
        forReader.Items.Select(item => (item.Id, item.IsPending, item.CanEdit, item.CanReport)).Should().Equal(
            (held.Id, true, true, false), (byAuthor.Id, false, false, true));
        var reply = () => Comments().CreateAsync(articleId, other, new("Ответ", held.Id, null), default);
        (await reply.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("comment_not_found");

        var queue = await Moderation().QueueAsync(CommentModerationQueue.Pending, 1, 20, default);
        queue.Items.Should().ContainSingle().Which.Should().Match<CommentModerationItemDto>(item =>
            item.Id == held.Id && item.AuthorName == "Новичок" && item.HoldReason == ArticleCommentHoldReason.NewAuthor && item.ArticlePublished);
        queue.Counts.Should().Be(new CommentModerationCountsDto(1, 0, 0));

        await Moderation().ModerateAsync(held.Id, admin, new(CommentModerationAction.Approve), default);
        var next = await Comments().CreateAsync(articleId, reader, new("Второй", null, null), default);

        next.IsPending.Should().BeFalse();
        (await Comments().ListAsync(articleId, other, 1, 20, default)).Total.Should().Be(3);
        (await _db.ArticleComments.SingleAsync(c => c.Id == held.Id)).Should().Match<ArticleComment>(c =>
            c.Status == ArticleCommentStatus.Published && c.ModeratedAt == Now && c.ModeratedById == admin);
    }

    [Fact]
    public async Task GivenSpamFilter_WhenACommentHasTooManyLinksABlockedWordOrRepeatsItself_ThenItIsHeldExceptAnAdmins()
    {
        _options.MaxLinks = 2;
        _options.BlockedWords = ["казино"];
        _options.DuplicateWindowHours = 24;
        var articleId = await ArticleAsync();
        var reader = await UserAsync();
        var admin = await UserAsync(UserRole.Admin, "Админ");
        const string links = "https://a.example https://www.b.example www.c.example";

        var linked = await Comments().CreateAsync(articleId, reader, new(links, null, null), default);
        var blocked = await Comments().CreateAsync(articleId, reader, new("Лучшее КАЗИНО тут", null, null), default);
        var first = await Comments().CreateAsync(articleId, reader, new("Повтор", null, null), default);
        var repeated = await Comments().CreateAsync(articleId, reader, new("Повтор", null, null), default);
        var byAdmin = await Comments().CreateAsync(articleId, admin, new(links, null, null), default);

        CommentSpamFilter.CountLinks(links).Should().Be(3);
        new[] { linked, blocked, first, repeated, byAdmin }.Select(c => c.IsPending).Should().Equal(true, true, false, true, false);
        (await _db.ArticleComments.Where(c => c.Status == ArticleCommentStatus.Pending).Select(c => c.HoldReason).ToListAsync())
            .Should().OnlyContain(reason => reason == ArticleCommentHoldReason.Spam);

        var edited = await Comments().UpdateAsync(first.Id, reader, new("Теперь с казино"), default);

        edited.IsPending.Should().BeTrue();
        (await Moderation().QueueAsync(CommentModerationQueue.Pending, 1, 20, default)).Total.Should().Be(4);
    }

    [Fact]
    public async Task GivenReports_WhenEnoughReadersReport_ThenTheCommentIsHeldAndApprovingSettlesThem()
    {
        _options.ReportsToHold = 2;
        var articleId = await ArticleAsync();
        var writer = await UserAsync(name: "Автор комментария");
        var first = await UserAsync(name: "Первая");
        var second = await UserAsync(name: "Второй");
        var third = await UserAsync(name: "Третий");
        var unconfirmed = await UserAsync(confirmed: false);
        var admin = await UserAsync(UserRole.Admin, "Админ");
        var comment = await Comments().CreateAsync(articleId, writer, new("Спорное мнение", null, null), default);

        var own = () => Comments().ReportAsync(comment.Id, writer, new(ArticleCommentReportReason.Spam, null), default);
        var noReason = () => Comments().ReportAsync(comment.Id, first, new(null, null), default);
        var tooLong = () => Comments().ReportAsync(comment.Id, first, new(ArticleCommentReportReason.Other, new string('x', 501)), default);
        var notConfirmed = () => Comments().ReportAsync(comment.Id, unconfirmed, new(ArticleCommentReportReason.Spam, null), default);
        (await own.Should().ThrowAsync<ForbiddenException>()).Which.Error.Code.Should().Be("forbidden");
        (await noReason.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("comment_report_reason_required");
        (await tooLong.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("comment_report_note_too_long");
        (await notConfirmed.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("email_not_confirmed");

        await Comments().ReportAsync(comment.Id, first, new(ArticleCommentReportReason.Abuse, "  Грубо  "), default);
        var again = () => Comments().ReportAsync(comment.Id, first, new(ArticleCommentReportReason.Spam, null), default);
        (await again.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("comment_already_reported");
        var reported = await Moderation().QueueAsync(CommentModerationQueue.Reported, 1, 20, default);
        reported.Items.Should().ContainSingle().Which.Reports.Should().Equal(
            new CommentReportSummaryDto(ArticleCommentReportReason.Abuse, "Грубо", "Первая", Now));

        _clock.Advance(TimeSpan.FromMinutes(1));
        await Comments().ReportAsync(comment.Id, second, new(ArticleCommentReportReason.Offtopic, null), default);

        var held = await _db.ArticleComments.AsNoTracking().SingleAsync(c => c.Id == comment.Id);
        (held.Status, held.HoldReason).Should().Be((ArticleCommentStatus.Pending, (ArticleCommentHoldReason?)ArticleCommentHoldReason.Reported));
        (await Comments().ListAsync(articleId, third, 1, 20, default)).Items.Should().BeEmpty();
        var pending = await Moderation().QueueAsync(CommentModerationQueue.Pending, 1, 20, default);
        pending.Items.Single().Reports.Select(r => r.Reason).Should().Equal(ArticleCommentReportReason.Offtopic, ArticleCommentReportReason.Abuse);
        pending.Counts.Should().Be(new CommentModerationCountsDto(1, 0, 0));

        _clock.Advance(TimeSpan.FromMinutes(1));
        await Moderation().ModerateAsync(comment.Id, admin, new(CommentModerationAction.Approve), default);
        (await Moderation().QueueAsync(CommentModerationQueue.Reported, 1, 20, default)).Total.Should().Be(0);

        _clock.Advance(TimeSpan.FromMinutes(1));
        await Comments().ReportAsync(comment.Id, third, new(ArticleCommentReportReason.Spam, null), default);

        (await _db.ArticleComments.AsNoTracking().SingleAsync(c => c.Id == comment.Id)).Status.Should().Be(ArticleCommentStatus.Published);
        (await Moderation().QueueAsync(CommentModerationQueue.Reported, 1, 20, default)).Items.Single().Reports
            .Select(r => r.ReporterName).Should().Equal("Третий");
    }

    [Fact]
    public async Task GivenHiddenComment_WhenListed_ThenItIsAPlaceholderWhileARepliesHangOnItAndCannotBeEditedAnsweredOrReported()
    {
        var articleId = await ArticleAsync();
        var writer = await UserAsync(name: "Автор");
        var other = await UserAsync(name: "Другой");
        var admin = await UserAsync(UserRole.Admin, "Админ");
        var answered = await Comments().CreateAsync(articleId, writer, new("С ответом", null, null), default);
        var reply = await Comments().CreateAsync(articleId, other, new("Ответ", answered.Id, null), default);
        var lonely = await Comments().CreateAsync(articleId, writer, new("Без ответа", null, null), default);

        await Moderation().ModerateAsync(answered.Id, admin, new(CommentModerationAction.Hide), default);
        await Moderation().ModerateAsync(lonely.Id, admin, new(CommentModerationAction.Hide), default);

        var forWriter = await Comments().ListAsync(articleId, writer, 1, 20, default);
        forWriter.Items.Select(item => (item.Id, item.IsHidden, item.Body, item.AuthorName)).Should().Equal(
            (answered.Id, true, (string?)null, (string?)null), (reply.Id, false, "Ответ", "Другой"));
        forWriter.Total.Should().Be(1);
        var edit = () => Comments().UpdateAsync(answered.Id, writer, new("Новый"), default);
        var answer = () => Comments().CreateAsync(articleId, other, new("Ещё", answered.Id, null), default);
        var report = () => Comments().ReportAsync(answered.Id, other, new(ArticleCommentReportReason.Spam, null), default);
        (await edit.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("comment_hidden");
        (await answer.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("comment_hidden");
        (await report.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("comment_hidden");
        (await Moderation().QueueAsync(CommentModerationQueue.Hidden, 1, 20, default)).Counts.Hidden.Should().Be(2);

        await Moderation().ModerateAsync(lonely.Id, admin, new(CommentModerationAction.Approve), default);
        var noAction = () => Moderation().ModerateAsync(lonely.Id, admin, new(null), default);
        await Comments().DeleteAsync(reply.Id, other, default);
        var deleted = () => Moderation().ModerateAsync(reply.Id, admin, new(CommentModerationAction.Approve), default);

        (await Comments().ListAsync(articleId, other, 1, 20, default)).Items.Select(item => item.Id).Should().Equal(lonely.Id);
        (await noAction.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("comment_moderation_action_required");
        (await deleted.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("comment_deleted");
    }

    [Fact]
    public async Task GivenBan_WhenTheUserComments_ThenTheyMayNotWriteOrEditUntilItEndsOrIsLifted()
    {
        var articleId = await ArticleAsync();
        var reader = await UserAsync(name: "Нарушитель");
        var admin = await UserAsync(UserRole.Admin, "Админ");
        var comment = await Comments().CreateAsync(articleId, reader, new("До бана", null, null), default);

        var ban = await Moderation().BanAsync(reader, admin, new(7, "  Спам  "), default);

        ban.Should().Be(new CommentBanDto(reader, ban.Email, "Нарушитель", Now.AddDays(7), "Спам", Now, "Админ"));
        var write = () => Comments().CreateAsync(articleId, reader, new("После бана", null, null), default);
        var edit = () => Comments().UpdateAsync(comment.Id, reader, new("Правка"), default);
        var refused = (await write.Should().ThrowAsync<ForbiddenException>()).Which.Error;
        (refused.Code, refused.Params!["until"]).Should().Be(("comment_banned", (object?)Now.AddDays(7)));
        (await edit.Should().ThrowAsync<ForbiddenException>()).Which.Error.Code.Should().Be("comment_banned");
        var page = await Comments().ListAsync(articleId, reader, 1, 20, default);
        page.Viewer.Should().Be(new ArticleCommentViewerDto(false, ArticleCommentBlock.Banned, Now.AddDays(7)));
        page.Items.Single().Should().Match<ArticleCommentDto>(item => item.IsMine && !item.CanEdit && item.CanDelete);
        (await Moderation().ListBansAsync(default)).Select(b => b.UserId).Should().Equal(reader);
        (await Moderation().QueueAsync(CommentModerationQueue.Pending, 1, 20, default)).Items.Should().BeEmpty();

        _clock.Advance(TimeSpan.FromDays(7));
        await write.Should().NotThrowAsync();
        (await Moderation().ListBansAsync(default)).Should().BeEmpty();

        await Moderation().BanAsync(reader, admin, new(null, null), default);
        await write.Should().ThrowAsync<ForbiddenException>();
        await Moderation().UnbanAsync(reader, default);
        await Moderation().UnbanAsync(reader, default);
        await write.Should().NotThrowAsync();
        (await _db.CommentBans.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task GivenBanRequest_WhenItTargetsAnAdminAnUnknownUserOrBadDays_ThenItIsRefused()
    {
        var admin = await UserAsync(UserRole.Admin, "Админ");
        var otherAdmin = await UserAsync(UserRole.Admin, "Другой админ");
        var reader = await UserAsync();

        var ofAdmin = () => Moderation().BanAsync(otherAdmin, admin, new(1, null), default);
        var unknown = () => Moderation().BanAsync(9999, admin, new(1, null), default);
        var zero = () => Moderation().BanAsync(reader, admin, new(0, null), default);
        var tooLong = () => Moderation().BanAsync(reader, admin, new(CommentModerationService.MaxBanDays + 1, null), default);
        var longReason = () => Moderation().BanAsync(reader, admin, new(1, new string('x', CommentBan.ReasonMaxLength + 1)), default);

        (await ofAdmin.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("comment_ban_admin");
        (await unknown.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("user_not_found");
        (await zero.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("comment_ban_days_invalid");
        (await tooLong.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("comment_ban_days_invalid");
        (await longReason.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("comment_ban_reason_too_long");
        (await _db.CommentBans.CountAsync()).Should().Be(0);
    }

    private ArticleCommentService Comments() =>
        new(_db, _clock, Options.Create(_options), NullLogger<ArticleCommentService>.Instance);

    private CommentModerationService Moderation() => new(_db, _clock);

    private async Task<int> UserAsync(UserRole role = UserRole.Reader, string? name = "Читатель", bool confirmed = true)
    {
        var user = new User
        {
            Email = $"{Guid.NewGuid():N}@mktba.test",
            Role = role,
            DisplayName = name,
            EmailConfirmedAtUtc = confirmed ? Now : null,
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user.Id;
    }

    private async Task<int> ArticleAsync()
    {
        var article = new Article
        {
            Title = "Намаз путника",
            Slug = $"a-{Guid.NewGuid():N}",
            Status = ArticleStatus.Published,
            CreatedAt = Now,
            UpdatedAt = Now,
        };
        _db.Articles.Add(article);
        await _db.SaveChangesAsync();
        return article.Id;
    }
}
