using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Verification;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Application.Services.Notifications;

/// <summary>What a notification says, for every recipient alike; the link is given per recipient.</summary>
public sealed record NotificationDraft(
    NotificationType Type,
    int? ActorId,
    int? ArticleId = null,
    string? ArticleTitle = null,
    ArticleRemark? Remark = null,
    ArticleReviewVerdict? Verdict = null,
    ArticleRemarkStatus? RemarkStatus = null,
    string? Message = null);

/// <summary>
/// Notifications to authors and scholars (V-09, #125): the in-app list of each user with its unread
/// count, and the email outbox the <c>NotificationEmailWorker</c> walks.
/// </summary>
/// <remarks>
/// <para>
/// The services whose actions notify (<see cref="ScholarApplicationReviewService"/>,
/// <see cref="ArticleReviewService"/>, <see cref="ArticleRemarkService"/>, the content save) call
/// <see cref="NotifyAsync"/> before their own save, so the action and its notifications are stored
/// together or not at all. Nobody is notified of their own action.
/// </para>
/// <para>
/// Defaults chosen by the agent, open for the owner in #125: every notification is in the list; it
/// also goes by email unless the recipient switched its category off (all on by default). An email
/// carries the type, the article's title and a link — never a remark's text, a refusal's reason or
/// a review's comment, which stay on the site behind the sign-in.
/// </para>
/// </remarks>
public sealed partial class NotificationService
{
    /// <summary>The page size when the request gives none.</summary>
    public const int DefaultPageSize = 20;

    /// <summary>The largest page of the list.</summary>
    public const int MaxPageSize = 100;

    private readonly MktbaDbContext _db;
    private readonly TimeProvider _clock;
    private readonly EmailOptions _email;

    public NotificationService(MktbaDbContext db, TimeProvider clock, IOptions<EmailOptions> email)
    {
        _db = db;
        _clock = clock;
        _email = email.Value;
    }

    /// <summary>The page of the user's scholar application.</summary>
    public const string ScholarApplicationLink = "/admin/scholar-application";

    /// <summary>The article in the editor: where its authors see the remarks.</summary>
    public static string EditorLink(int articleId) => $"/admin/articles/{articleId}/edit";

    /// <summary>The article's review page: where the scholar sees their marks and remarks.</summary>
    public static string ReviewLink(int articleId) => $"/admin/article-reviews/{articleId}";

    /// <summary>
    /// Adds the notification for each recipient but the actor (each once), with its email when the
    /// recipient takes that category by email. Does not save: the caller's save stores them.
    /// </summary>
    public async Task NotifyAsync(NotificationDraft draft, IEnumerable<int?> recipients, string link, CancellationToken cancellationToken)
    {
        var ids = recipients.OfType<int>().Where(id => id != draft.ActorId).Distinct().ToList();
        if (ids.Count == 0)
        {
            return;
        }

        var category = Notification.CategoryOf(draft.Type);
        var settings = await _db.UserNotificationSettings.AsNoTracking()
            .Where(row => ids.Contains(row.UserId))
            .ToDictionaryAsync(row => row.UserId, cancellationToken);
        var now = _clock.GetUtcNow().UtcDateTime;
        foreach (var id in ids)
        {
            var notification = new Notification
            {
                UserId = id,
                Type = draft.Type,
                ActorId = draft.ActorId,
                ArticleId = draft.ArticleId,
                ArticleTitle = Cut(draft.ArticleTitle, Notification.ArticleTitleMaxLength),
                Remark = draft.Remark,
                Verdict = draft.Verdict,
                RemarkStatus = draft.RemarkStatus,
                Excerpt = Excerpt(draft.Message),
                Link = link,
                CreatedAt = now,
            };
            if (!settings.TryGetValue(id, out var choice) || choice.EmailsFor(category))
            {
                notification.Email = new NotificationEmail { State = EmailDeliveryState.Pending, NextAttemptAt = now };
            }

            _db.Notifications.Add(notification);
        }
    }

    /// <summary>The article's author and co-authors.</summary>
    public async Task<List<int?>> AuthorsOfAsync(int articleId, CancellationToken cancellationToken)
    {
        var author = await _db.Articles.AsNoTracking()
            .Where(article => article.Id == articleId)
            .Select(article => article.AuthorId)
            .FirstOrDefaultAsync(cancellationToken);
        var coAuthors = await _db.ArticleCoAuthors.AsNoTracking()
            .Where(coAuthor => coAuthor.ArticleId == articleId)
            .Select(coAuthor => (int?)coAuthor.UserId)
            .ToListAsync(cancellationToken);
        return [author, .. coAuthors];
    }

    /// <summary>
    /// After a content save wrote <paramref name="revisionId"/>: asks every verified scholar whose
    /// latest mark on the published article was current before this save and is stale after it to
    /// review the article again (D5, #115; V-05, #121). An edit that leaves a scholar's scope as it was
    /// asks nothing, and a mark already stale is not asked about again. Does not save.
    /// </summary>
    public async Task NotifyStaleReviewsAsync(int articleId, int revisionId, int? editorId, CancellationToken cancellationToken)
    {
        var article = await _db.Articles.AsNoTracking()
            .Where(candidate => candidate.Id == articleId && candidate.Status == ArticleStatus.Published && candidate.DeletedAt == null)
            .Select(candidate => new { candidate.Title })
            .FirstOrDefaultAsync(cancellationToken);
        if (article is null)
        {
            return;
        }

        var revisions = await _db.ArticleRevisions.AsNoTracking()
            .Where(revision => revision.ArticleId == articleId)
            .OrderByDescending(revision => revision.Number)
            .Select(revision => new { revision.Id, revision.Number })
            .Take(2)
            .ToListAsync(cancellationToken);
        if (revisions.Count < 2 || revisions[0].Id != revisionId)
        {
            return;
        }

        var previousId = revisions[1].Id;
        var reviews = await _db.ArticleReviews.AsNoTracking()
            .Where(review => review.ArticleId == articleId
                && review.Scholar.Role == UserRole.Scholar
                && _db.ScholarApplications.Any(application =>
                    application.UserId == review.ScholarId && application.Status == ScholarApplicationStatus.Approved))
            .Select(review => new { review.ScholarId, review.RevisionId, review.Revision.Number, review.Mazhab })
            .ToListAsync(cancellationToken);
        var latest = reviews
            .GroupBy(review => review.ScholarId)
            .Select(group => group.OrderByDescending(review => review.Number).First())
            .ToList();
        if (latest.Count == 0)
        {
            return;
        }

        var ids = latest.Select(review => review.RevisionId).Append(previousId).Append(revisionId).Distinct().ToList();
        var hashes = (await _db.ArticleRevisionFingerprints.AsNoTracking()
                .Where(fingerprint => ids.Contains(fingerprint.RevisionId))
                .Select(fingerprint => new { fingerprint.RevisionId, fingerprint.Scope, fingerprint.Hash })
                .ToListAsync(cancellationToken))
            .ToDictionary(row => (row.RevisionId, row.Scope), row => row.Hash);
        var stale = latest
            .Where(review => ArticleReviewService.SameText(hashes, review.RevisionId, previousId, review.Mazhab)
                && !ArticleReviewService.SameText(hashes, review.RevisionId, revisionId, review.Mazhab))
            .Select(review => (int?)review.ScholarId);
        await NotifyAsync(
            new NotificationDraft(NotificationType.ReReviewRequested, editorId, articleId, article.Title),
            stale,
            ReviewLink(articleId),
            cancellationToken);
    }

    /// <summary>
    /// One page of the user's notifications, newest first (only the unread with <paramref name="unreadOnly"/>).
    /// A page below 1 is the first, the page size is kept within 1 to <see cref="MaxPageSize"/>.
    /// </summary>
    public async Task<NotificationPageDto> ListAsync(int userId, bool unreadOnly, int page, int pageSize, CancellationToken cancellationToken)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);
        var mine = _db.Notifications.AsNoTracking().Where(notification => notification.UserId == userId);
        var query = unreadOnly ? mine.Where(notification => notification.ReadAt == null) : mine;
        var total = await query.CountAsync(cancellationToken);
        var unread = unreadOnly ? total : await mine.CountAsync(notification => notification.ReadAt == null, cancellationToken);
        var items = await query
            .OrderByDescending(notification => notification.CreatedAt).ThenByDescending(notification => notification.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(notification => new NotificationDto(
                notification.Id,
                notification.Type,
                notification.ArticleId,
                notification.ArticleTitle,
                notification.Actor == null ? null : notification.Actor.DisplayName,
                notification.Verdict,
                notification.RemarkStatus,
                notification.Excerpt,
                notification.Link,
                notification.CreatedAt,
                notification.ReadAt))
            .ToListAsync(cancellationToken);
        return new NotificationPageDto(items, total, unread, page, pageSize);
    }

    public async Task<NotificationUnreadCountDto> CountUnreadAsync(int userId, CancellationToken cancellationToken) =>
        new(await _db.Notifications.CountAsync(notification => notification.UserId == userId && notification.ReadAt == null, cancellationToken));

    /// <summary>Marks one of the user's notifications read; reading it again changes nothing.</summary>
    /// <exception cref="NotFoundException">No such notification of this user.</exception>
    public async Task MarkReadAsync(int userId, int id, CancellationToken cancellationToken)
    {
        var notification = await _db.Notifications
            .FirstOrDefaultAsync(candidate => candidate.Id == id && candidate.UserId == userId, cancellationToken)
            ?? throw new NotFoundException(AppErrors.NotificationNotFound);
        if (notification.ReadAt is null)
        {
            notification.ReadAt = _clock.GetUtcNow().UtcDateTime;
            await _db.SaveChangesAsync(cancellationToken);
        }
    }

    /// <summary>Marks every unread notification of the user read.</summary>
    public async Task MarkAllReadAsync(int userId, CancellationToken cancellationToken)
    {
        var unread = await _db.Notifications
            .Where(notification => notification.UserId == userId && notification.ReadAt == null)
            .ToListAsync(cancellationToken);
        if (unread.Count == 0)
        {
            return;
        }

        var now = _clock.GetUtcNow().UtcDateTime;
        foreach (var notification in unread)
        {
            notification.ReadAt = now;
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<NotificationSettingsDto> GetSettingsAsync(int userId, CancellationToken cancellationToken) =>
        ToDto(await _db.UserNotificationSettings.AsNoTracking().FirstOrDefaultAsync(row => row.UserId == userId, cancellationToken)
            ?? new UserNotificationSettings());

    public async Task<NotificationSettingsDto> UpdateSettingsAsync(int userId, NotificationSettingsWriteDto dto, CancellationToken cancellationToken)
    {
        var settings = await _db.UserNotificationSettings.FirstOrDefaultAsync(row => row.UserId == userId, cancellationToken);
        if (settings is null)
        {
            settings = new UserNotificationSettings { UserId = userId };
            _db.UserNotificationSettings.Add(settings);
        }

        settings.EmailScholarApplication = dto.EmailScholarApplication;
        settings.EmailArticleReviews = dto.EmailArticleReviews;
        settings.EmailRemarks = dto.EmailRemarks;
        await _db.SaveChangesAsync(cancellationToken);
        return ToDto(settings);
    }

    private NotificationSettingsDto ToDto(UserNotificationSettings settings) =>
        new(settings.EmailScholarApplication, settings.EmailArticleReviews, settings.EmailRemarks, _email.SendsThroughSmtp);

    /// <summary>A message's start on one line, at most <see cref="Notification.ExcerptMaxLength"/> characters; null for none.</summary>
    internal static string? Excerpt(string? message)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            return null;
        }

        var line = WhiteSpace().Replace(message, " ").Trim();
        return line.Length <= Notification.ExcerptMaxLength ? line : line[..(Notification.ExcerptMaxLength - 1)].TrimEnd() + "…";
    }

    private static string? Cut(string? value, int maxLength) =>
        value is null || value.Length <= maxLength ? value : value[..(maxLength - 1)].TrimEnd() + "…";

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhiteSpace();
}
