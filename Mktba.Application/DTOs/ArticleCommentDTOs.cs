using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs;

/// <summary>Why the caller may not write a comment right now (C-01, #127).</summary>
public enum ArticleCommentBlock
{
    /// <summary>Nobody is signed in.</summary>
    SignInRequired = 1,

    /// <summary>The caller's email address is not confirmed yet (U-05, #126).</summary>
    EmailNotConfirmed = 2,

    /// <summary>The caller has no display name in their profile: a comment is signed with it.</summary>
    DisplayNameRequired = 3,

    /// <summary>A moderator has barred the caller from commenting (C-02, #128); see <see cref="ArticleCommentViewerDto.BannedUntil"/>.</summary>
    Banned = 4,
}

/// <summary>
/// One comment of an article as readers see it (C-01, #127). Never an email or a user id: the
/// author is their profile name.
/// </summary>
/// <param name="ParentId">The comment it answers; null for a top-level comment.</param>
/// <param name="AuthorName">The author's profile name; null for a deleted comment, a deleted user or a user who has removed their name.</param>
/// <param name="Body">The Markdown source; null for a deleted comment.</param>
/// <param name="IsDeleted">Deleted by its author or an admin; shown as «комментарий удалён» because replies hang on it.</param>
/// <param name="IsHidden">Hidden by a moderator, or held for one and not the caller's (C-02, #128); shown as «комментарий скрыт» because replies hang on it, without author or text.</param>
/// <param name="IsPending">The caller's own comment held for a moderator: nobody else sees it yet.</param>
/// <param name="IsMine">The caller wrote it.</param>
/// <param name="CanEdit">The caller may change its text: their own comment, not deleted, and they are not barred.</param>
/// <param name="CanDelete">The caller may delete it: their own, or any for an admin; not deleted yet.</param>
/// <param name="CanReport">The caller may report it: someone else's published comment.</param>
/// <param name="EditedAt">When the text was last changed; null if never.</param>
public sealed record ArticleCommentDto(
    int Id,
    int? ParentId,
    string? AuthorName,
    string? Body,
    bool IsDeleted,
    bool IsHidden,
    bool IsPending,
    bool IsMine,
    bool CanEdit,
    bool CanDelete,
    bool CanReport,
    DateTime CreatedAt,
    DateTime? EditedAt);

/// <summary>What the caller may do in an article's comments.</summary>
/// <param name="CanComment">The caller may write a comment or a reply.</param>
/// <param name="Block">Why not, when <paramref name="CanComment"/> is false.</param>
/// <param name="BannedUntil">With <see cref="ArticleCommentBlock.Banned"/>: when the ban ends; null for good.</param>
public sealed record ArticleCommentViewerDto(bool CanComment, ArticleCommentBlock? Block, DateTime? BannedUntil = null);

/// <summary>
/// One page of an article's comments (C-01, #127): <paramref name="PageSize"/> top-level comments,
/// oldest first, each followed by its whole reply tree (replies oldest first, in
/// <see cref="ArticleCommentDto.ParentId"/> order of the tree). A deleted comment is listed only while a
/// reply that is listed hangs on it; so is a hidden one, or one held for a moderator that is not the caller's.
/// </summary>
/// <param name="Items">The page's comments: every top-level comment of the page and all its replies, flat; the client builds the tree from <see cref="ArticleCommentDto.ParentId"/>.</param>
/// <param name="Total">Published comments of the article that are not deleted.</param>
/// <param name="Threads">Top-level comments listed over all pages (deleted ones with replies included).</param>
public sealed record ArticleCommentPageDto(
    IReadOnlyList<ArticleCommentDto> Items,
    int Total,
    int Threads,
    int Page,
    int PageSize,
    ArticleCommentViewerDto Viewer);

/// <summary>A new comment, or a reply when <paramref name="ParentId"/> is set.</summary>
/// <param name="Body">Markdown-минимум: bold, italic, links, code, quotes. Up to <c>ArticleComment.BodyMaxLength</c> characters after trimming.</param>
/// <param name="ParentId">The comment of the same article this one answers.</param>
/// <param name="Website">A trap for bots: the form never fills it; anything but white space is answered as a success and nothing is stored.</param>
public sealed record ArticleCommentCreateDto(string? Body, int? ParentId, string? Website);

/// <summary>The new text of the caller's own comment.</summary>
public sealed record ArticleCommentUpdateDto(string? Body);

/// <summary>A reader's report of someone else's comment (C-02, #128).</summary>
/// <param name="Reason">What is wrong with it; required.</param>
/// <param name="Note">Optional, up to <c>ArticleCommentReport.NoteMaxLength</c> characters after trimming.</param>
public sealed record ArticleCommentReportCreateDto(ArticleCommentReportReason? Reason, string? Note);
