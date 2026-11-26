using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs;

/// <summary>
/// One in-app notification (V-09, #125). The client words it from <see cref="Type"/> and the fields;
/// <see cref="Link"/> is the site-relative page it leads to.
/// </summary>
/// <param name="ArticleTitle">The article's title when the notification was made; null for the scholar application's.</param>
/// <param name="ActorName">The profile name of who did it, null without one (never an email).</param>
/// <param name="Verdict">For <see cref="NotificationType.ArticleReviewed"/>.</param>
/// <param name="RemarkStatus">For <see cref="NotificationType.RemarkClosed"/>: <c>Resolved</c> or <c>Closed</c>.</param>
/// <param name="Excerpt">The start of a remark message as plain text, when there was one.</param>
public sealed record NotificationDto(
    int Id,
    NotificationType Type,
    int? ArticleId,
    string? ArticleTitle,
    string? ActorName,
    ArticleReviewVerdict? Verdict,
    ArticleRemarkStatus? RemarkStatus,
    string? Excerpt,
    string Link,
    DateTime CreatedAt,
    DateTime? ReadAt);

/// <param name="Unread">The caller's unread notifications in all, whatever the page.</param>
public sealed record NotificationPageDto(IReadOnlyList<NotificationDto> Items, int Total, int Unread, int Page, int PageSize);

public sealed record NotificationUnreadCountDto(int Unread);

/// <summary>The caller's email choices per category; in-app notifications are always on.</summary>
/// <param name="EmailsSent">Whether the site sends email at all now (a mail server is configured).</param>
public sealed record NotificationSettingsDto(bool EmailScholarApplication, bool EmailArticleReviews, bool EmailRemarks, bool EmailsSent);

public sealed record NotificationSettingsWriteDto(bool EmailScholarApplication, bool EmailArticleReviews, bool EmailRemarks);
