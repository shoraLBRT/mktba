using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs;

/// <summary>The moderators' queues of comments (C-02, #128).</summary>
public enum CommentModerationQueue
{
    /// <summary>Held for a moderator: a new reader's, caught by the spam filter, or reported enough times. Oldest first.</summary>
    Pending = 1,

    /// <summary>Published comments with reports since they were last moderated. Oldest first.</summary>
    Reported = 2,

    /// <summary>Hidden by a moderator; most recently moderated first.</summary>
    Hidden = 3,
}

/// <summary>What a moderator does with a comment.</summary>
public enum CommentModerationAction
{
    /// <summary>Publish it (again): readers see it, the reports so far are dealt with.</summary>
    Approve = 1,

    /// <summary>Take it down: listed as «комментарий скрыт» while replies hang on it.</summary>
    Hide = 2,
}

/// <summary>A moderator's decision on a comment.</summary>
public sealed record CommentModerationDto(CommentModerationAction? Action);

/// <summary>One report as moderators see it.</summary>
/// <param name="ReporterName">The reporter's profile name, or their email without one; null once that user is gone.</param>
public sealed record CommentReportSummaryDto(ArticleCommentReportReason Reason, string? Note, string? ReporterName, DateTime CreatedAt);

/// <summary>One comment in a moderators' queue.</summary>
/// <param name="ArticleSlug">For the link to the article; the article may no longer be published.</param>
/// <param name="ArticlePublished">Whether readers are served the article (and so its comments) now.</param>
/// <param name="AuthorId">For a ban; null once the author is deleted.</param>
/// <param name="AuthorBannedUntil">With <paramref name="AuthorBanned"/>: when the ban ends; null for good.</param>
/// <param name="HoldReason">Why it was last held; null if never.</param>
/// <param name="Reports">The reports since it was last moderated, newest first.</param>
public sealed record CommentModerationItemDto(
    int Id,
    int ArticleId,
    string ArticleTitle,
    string ArticleSlug,
    bool ArticlePublished,
    int? ParentId,
    int? AuthorId,
    string? AuthorName,
    string? AuthorEmail,
    bool AuthorBanned,
    DateTime? AuthorBannedUntil,
    string Body,
    ArticleCommentStatus Status,
    ArticleCommentHoldReason? HoldReason,
    DateTime CreatedAt,
    DateTime? EditedAt,
    DateTime? ModeratedAt,
    IReadOnlyList<CommentReportSummaryDto> Reports);

/// <summary>How many comments wait in each queue.</summary>
public sealed record CommentModerationCountsDto(int Pending, int Reported, int Hidden);

/// <summary>A page of one queue, with every queue's count.</summary>
public sealed record CommentModerationPageDto(
    IReadOnlyList<CommentModerationItemDto> Items,
    int Total,
    int Page,
    int PageSize,
    CommentModerationCountsDto Counts);

/// <summary>A user barred from commenting, as moderators see it.</summary>
/// <param name="Until">When it ends; null for good.</param>
/// <param name="CreatedByName">The moderator's profile name or email; null once that user is gone.</param>
public sealed record CommentBanDto(
    int UserId,
    string Email,
    string? DisplayName,
    DateTime? Until,
    string? Reason,
    DateTime CreatedAt,
    string? CreatedByName);

/// <summary>A ban on commenting; it replaces the user's current one.</summary>
/// <param name="Days">How long, 1 to <c>CommentModerationService.MaxBanDays</c>; null: for good.</param>
/// <param name="Reason">Optional, up to <c>CommentBan.ReasonMaxLength</c> characters; moderators only see it.</param>
public sealed record CommentBanCreateDto(int? Days, string? Reason);
