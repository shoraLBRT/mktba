using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Email;
using Mktba.Application.Services.Notifications;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Application.Tests;

/// <summary>V-09 (#125): the in-app list, the email choices and the email outbox.</summary>
public sealed class NotificationTests : IDisposable
{
    private static readonly DateTime Now = new(2026, 11, 26, 10, 0, 0, DateTimeKind.Utc);

    private readonly MktbaDbContext _db;
    private readonly FeedbackTests.FakeClock _clock = new(Now);
    private readonly FakeEmailSender _sender = new();

    public NotificationTests()
    {
        _db = new MktbaDbContext(new DbContextOptionsBuilder<MktbaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        _db.Database.EnsureCreated();
    }

    public void Dispose() => _db.Dispose();

    /// <summary>The service as the other suites need it: email options as committed (no mail server).</summary>
    internal static NotificationService Service(MktbaDbContext db, TimeProvider clock) =>
        new(db, clock, Options.Create(new EmailOptions()));

    [Fact]
    public async Task GivenNotificationsOfTwoUsers_WhenOneListsAndReadsThem_ThenOnlyTheirOwnAreSeenNewestFirstAndCounted()
    {
        var userId = await UserAsync("Аиша");
        var otherId = await UserAsync(null);
        var actorId = await UserAsync("Учёный Ахмад");
        await NotifyAsync(NotificationType.RemarkCreated, actorId, userId, "  Первое\n\nзамечание ");
        _clock.Advance(TimeSpan.FromMinutes(1));
        await NotifyAsync(NotificationType.RemarkReplied, actorId, userId, new string('х', 300));
        await NotifyAsync(NotificationType.RemarkCreated, actorId, otherId, "Чужое");

        var page = await Service(_db, _clock).ListAsync(userId, false, 1, 20, default);

        (page.Total, page.Unread).Should().Be((2, 2));
        page.Items.Select(item => item.Type).Should().Equal(NotificationType.RemarkReplied, NotificationType.RemarkCreated);
        page.Items[1].Should().Match<NotificationDto>(item =>
            item.Excerpt == "Первое замечание" && item.ActorName == "Учёный Ахмад" && item.ArticleTitle == "Намаз" && item.Link == "/admin/articles/7/edit");
        page.Items[0].Excerpt.Should().HaveLength(Notification.ExcerptMaxLength).And.EndWith("…");

        var otherOne = (await Service(_db, _clock).ListAsync(otherId, false, 1, 20, default)).Items.Single().Id;
        var stranger = () => Service(_db, _clock).MarkReadAsync(userId, otherOne, default);
        (await stranger.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("notification_not_found");

        await Service(_db, _clock).MarkReadAsync(userId, page.Items[1].Id, default);
        _clock.Advance(TimeSpan.FromMinutes(1));
        await Service(_db, _clock).MarkReadAsync(userId, page.Items[1].Id, default);
        var unread = await Service(_db, _clock).ListAsync(userId, true, 1, 20, default);
        (unread.Total, unread.Unread, unread.Items.Single().Type).Should().Be((1, 1, NotificationType.RemarkReplied));
        (await _db.Notifications.AsNoTracking().SingleAsync(n => n.Id == page.Items[1].Id)).ReadAt.Should().Be(Now.AddMinutes(1));

        await Service(_db, _clock).MarkAllReadAsync(userId, default);

        (await Service(_db, _clock).CountUnreadAsync(userId, default)).Unread.Should().Be(0);
        (await Service(_db, _clock).CountUnreadAsync(otherId, default)).Unread.Should().Be(1);
        var clamped = await Service(_db, _clock).ListAsync(userId, false, 0, 1000, default);
        (clamped.Page, clamped.PageSize).Should().Be((1, NotificationService.MaxPageSize));
    }

    [Fact]
    public async Task GivenAnActorAmongTheRecipients_WhenNotified_ThenTheActorIsLeftOutAndEachRecipientGetsOne()
    {
        var actorId = await UserAsync(null);
        var userId = await UserAsync(null);

        await Service(_db, _clock).NotifyAsync(
            new NotificationDraft(NotificationType.ArticleReviewed, actorId, 7, "Намаз", Verdict: ArticleReviewVerdict.Confirmed),
            [actorId, userId, userId, null], "/admin/articles/7/edit", default);
        await _db.SaveChangesAsync();

        (await _db.Notifications.AsNoTracking().Select(n => n.UserId).ToListAsync()).Should().Equal(userId);
    }

    [Fact]
    public async Task GivenNoSettings_WhenRead_ThenEveryCategoryIsByEmailAndAChangeIsKeptAndHonoured()
    {
        var userId = await UserAsync(null);

        (await Service(_db, _clock).GetSettingsAsync(userId, default)).Should().Be(new NotificationSettingsDto(true, true, true, false));
        var changed = await Service(_db, _clock).UpdateSettingsAsync(userId, new NotificationSettingsWriteDto(true, false, false), default);
        changed.Should().Be(new NotificationSettingsDto(true, false, false, false));
        (await Service(_db, _clock).GetSettingsAsync(userId, default)).Should().Be(changed);

        await NotifyAsync(NotificationType.ScholarApplicationApproved, null, userId, null);
        await NotifyAsync(NotificationType.ReReviewRequested, null, userId, null);
        await NotifyAsync(NotificationType.RemarkReplied, null, userId, "Ответ");

        var emails = await _db.Notifications.AsNoTracking().Where(n => n.Email != null).Select(n => n.Type).ToListAsync();
        emails.Should().Equal(NotificationType.ScholarApplicationApproved);
    }

    [Fact]
    public async Task GivenPendingEmails_WhenTheOutboxIsWalked_ThenEachIsSentOnceWithoutTheRemarksText()
    {
        var userId = await UserAsync("Аиша");
        await NotifyAsync(NotificationType.RemarkReplied, null, userId, "Секретный текст ответа");
        await NotifyAsync(NotificationType.ScholarApplicationRejected, null, userId, null, NotificationService.ScholarApplicationLink);

        var run = await Emails().SendDueAsync();
        var again = await Emails().SendDueAsync();

        (run.Sent, run.ServerUnavailable, again.Sent).Should().Be((2, false, 0));
        _sender.Sent.Select(message => message.Subject).Should().Equal("Новый ответ в замечании — mktba", "Заявка учёного отклонена — mktba");
        var reply = _sender.Sent[0];
        (reply.To, reply.ToName).Should().Be(((await _db.Users.SingleAsync(u => u.Id == userId)).Email, "Аиша"));
        reply.TextBody.Should().Contain("Здравствуйте, Аиша!").And.Contain("«Намаз»").And.Contain("https://mktba.test/admin/articles/7/edit")
            .And.Contain("https://mktba.test/admin/profile").And.NotContain("Секретный");
        _sender.Sent[1].TextBody.Should().Contain("Причина указана на странице заявки").And.Contain("https://mktba.test/admin/scholar-application");
        (await _db.NotificationEmails.AsNoTracking().ToListAsync()).Should().OnlyContain(email =>
            email.State == EmailDeliveryState.Sent && email.Attempts == 1 && email.SentAt == Now && email.LastError == null);
    }

    [Fact]
    public async Task GivenTheServerAway_WhenTheOutboxIsWalked_ThenTheRunStopsAndEachEmailWaitsForItsNextAttempt()
    {
        var userId = await UserAsync(null);
        await NotifyAsync(NotificationType.RemarkCreated, null, userId, null);
        await NotifyAsync(NotificationType.RemarkCreated, null, userId, null);
        _sender.Failure = new EmailSendException("The mail server could not be used: SocketException.", permanent: false);

        var first = await Emails().SendDueAsync();

        (first.Sent, first.ServerUnavailable).Should().Be((0, true));
        var emails = await _db.NotificationEmails.AsNoTracking().OrderBy(e => e.Id).ToListAsync();
        emails.Select(e => (e.State, e.Attempts)).Should().Equal((EmailDeliveryState.Pending, 1), (EmailDeliveryState.Pending, 0));
        emails[0].NextAttemptAt.Should().Be(Now.AddSeconds(60));
        emails[0].LastError.Should().Contain("SocketException");

        _clock.Advance(TimeSpan.FromSeconds(60));
        await Emails().SendDueAsync();

        (await _db.NotificationEmails.AsNoTracking().OrderBy(e => e.Id).Select(e => e.State).FirstAsync()).Should().Be(EmailDeliveryState.Pending);
        var waiting = await _db.NotificationEmails.AsNoTracking().OrderBy(e => e.Id).ToListAsync();
        waiting.Select(e => e.Attempts).Should().Equal(1, 1);

        _sender.Failure = null;
        _clock.Advance(TimeSpan.FromSeconds(60));
        var recovered = await Emails().SendDueAsync();
        recovered.Sent.Should().Be(2);
    }

    [Fact]
    public async Task GivenARefusalOrTheLastAttempt_WhenTheEmailFails_ThenItIsGivenUp()
    {
        var userId = await UserAsync(null);
        await NotifyAsync(NotificationType.RemarkCreated, null, userId, null);
        _sender.Failure = new EmailSendException("The mail server refused the message: 550.", permanent: true);

        var refused = await Emails().SendDueAsync();

        (refused.Sent, refused.ServerUnavailable).Should().Be((0, false));
        (await _db.NotificationEmails.AsNoTracking().SingleAsync()).State.Should().Be(EmailDeliveryState.Failed);

        await NotifyAsync(NotificationType.RemarkCreated, null, userId, null);
        _sender.Failure = new EmailSendException("The mail server answered 421 (UnexpectedStatusCode).", permanent: false);
        await Emails(maxAttempts: 1).SendDueAsync();

        (await _db.NotificationEmails.AsNoTracking().Select(e => e.State).ToListAsync()).Should().Equal(EmailDeliveryState.Failed, EmailDeliveryState.Failed);
        _clock.Advance(TimeSpan.FromDays(1));
        (await Emails().SendDueAsync()).Sent.Should().Be(0);
    }

    [Fact]
    public void GivenEveryType_WhenWorded_ThenTheSubjectNamesNoArticleAndTheBodyCarriesTheVerdictOrOutcome()
    {
        var options = new EmailOptions { SiteUrl = "https://mktba.test/", SiteName = "mktba" };
        foreach (var type in Enum.GetValues<NotificationType>())
        {
            var notification = new Notification { Type = type, ArticleTitle = "Особая\nстатья", Link = "/x" };
            NotificationEmailFormatter.Subject(notification, options).Should().NotContain("Особая").And.EndWith(" — mktba");
            NotificationEmailFormatter.Body(notification, null, options).Should().StartWith("Здравствуйте!").And.Contain("https://mktba.test/x");
        }

        NotificationEmailFormatter.Body(
                new Notification { Type = NotificationType.ArticleReviewed, ArticleTitle = "Особая\nстатья", Verdict = ArticleReviewVerdict.HasErrors, Link = "/x" },
                "Имя\r\nBcc: x@example.com", options)
            .Should().Contain("«есть ошибки» к статье «Особая статья»").And.Contain("Здравствуйте, Имя Bcc: x@example.com!");
        NotificationEmailFormatter.Body(
                new Notification { Type = NotificationType.RemarkClosed, ArticleTitle = "А", RemarkStatus = ArticleRemarkStatus.Closed, Link = "/x" }, null, options)
            .Should().Contain("закрыто без исправлений");
        new EmailOptions { SiteUrl = "ftp://mktba.test" }.SiteBaseUrl.Should().BeNull();
        new EmailOptions { SiteUrl = "https://mktba.test", Smtp = new SmtpOptions { Host = "smtp.test", FromAddress = "n@mktba.test" } }
            .SendsThroughSmtp.Should().BeTrue();
        new EmailOptions { Smtp = new SmtpOptions { Host = "smtp.test", FromAddress = "n@mktba.test" } }.SendsThroughSmtp.Should().BeFalse();
        new EmailOptions { SiteUrl = "https://mktba.test", Smtp = new SmtpOptions { Enabled = false, Host = "smtp.test", FromAddress = "n@mktba.test" } }
            .SendsThroughSmtp.Should().BeFalse();
    }

    private NotificationEmailService Emails(int maxAttempts = 10) => new(
        _db,
        _sender,
        Options.Create(new EmailOptions { SiteUrl = "https://mktba.test", Delivery = new EmailDeliveryOptions { MaxAttempts = maxAttempts } }),
        _clock,
        NullLogger<NotificationEmailService>.Instance);

    private async Task NotifyAsync(NotificationType type, int? actorId, int userId, string? message, string link = "/admin/articles/7/edit")
    {
        await Service(_db, _clock).NotifyAsync(
            new NotificationDraft(type, actorId, 7, "Намаз", Message: message), [userId], link, default);
        await _db.SaveChangesAsync();
    }

    private async Task<int> UserAsync(string? displayName)
    {
        var user = new User { Email = $"{Guid.NewGuid():N}@mktba.test", Role = UserRole.Author, DisplayName = displayName };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user.Id;
    }

    /// <summary>Records what it is given, or fails with <see cref="Failure"/> while that is set.</summary>
    internal sealed class FakeEmailSender : IEmailSender
    {
        public List<EmailMessage> Sent { get; } = [];

        public EmailSendException? Failure { get; set; }

        public Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
        {
            if (Failure is not null)
            {
                throw Failure;
            }

            Sent.Add(message);
            return Task.CompletedTask;
        }
    }
}
