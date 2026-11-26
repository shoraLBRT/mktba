using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs;

/// <summary>Who wrote a message of a remark's thread, as the thread shows it (V-06, #122).</summary>
public enum ArticleRemarkParticipant
{
    /// <summary>The scholar who made the remark.</summary>
    Scholar = 1,

    /// <summary>The article's author or a co-author.</summary>
    Author = 2,

    /// <summary>An editor (an admin) who is not one of the article's authors.</summary>
    Editor = 3,

    /// <summary>A user deleted since, or one who no longer has any of these parts.</summary>
    Former = 4,
}

/// <summary>One message of a remark's thread.</summary>
/// <param name="AuthorName">The writer's profile name; null when they have none (the thread then shows <paramref name="Participant"/>). Never an email.</param>
/// <param name="IsMine">Whether the caller wrote it.</param>
public sealed record ArticleRemarkMessageDto(
    int Id,
    string? AuthorName,
    ArticleRemarkParticipant Participant,
    bool IsMine,
    string Body,
    DateTime CreatedAt);

/// <summary>
/// A scholar's remark on a block of an article with its thread (V-06, #122), as one of its
/// participants sees it: the scholar, the article's authors, an editor.
/// </summary>
/// <param name="RevisionNumber">The revision the scholar read when making it.</param>
/// <param name="ParagraphId">The paragraph in the working copy; null once it is deleted.</param>
/// <param name="OpinionId">The opinion, for a remark on one opinion of a block; null otherwise or once it is deleted.</param>
/// <param name="OnOpinion">Whether the remark is about one opinion rather than the whole paragraph.</param>
/// <param name="ParagraphOrder">The paragraph's position in the remark's revision.</param>
/// <param name="CurrentParagraphOrder">The paragraph's position now; null once the block is deleted.</param>
/// <param name="Excerpt">The block's text in the remark's revision (plain text, cut).</param>
/// <param name="BlockRemoved">The paragraph — or, for a remark on an opinion, that opinion — has been deleted since.</param>
/// <param name="ScholarName">The scholar's profile name; null when they have none.</param>
/// <param name="ClosedAt">When it was last closed; null while open.</param>
/// <param name="CanReply">The caller may add a message: the remark is open and they are its scholar (still verified), an author or an editor.</param>
/// <param name="CanClose">The caller may close it: it is open and they are an author or an editor.</param>
/// <param name="CanReopen">The caller may reopen it: it is closed and they are its scholar (still verified) or an editor.</param>
/// <param name="Messages">The thread, oldest first; the first message is the remark itself.</param>
public sealed record ArticleRemarkDto(
    int Id,
    int ArticleId,
    int RevisionNumber,
    int? ParagraphId,
    int? OpinionId,
    bool OnOpinion,
    int ParagraphOrder,
    int? CurrentParagraphOrder,
    string Excerpt,
    bool BlockRemoved,
    ArticleRemarkStatus Status,
    string? ScholarName,
    bool IsMine,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? ClosedAt,
    bool CanReply,
    bool CanClose,
    bool CanReopen,
    IReadOnlyList<ArticleRemarkMessageDto> Messages);

/// <summary>The remarks on an article the caller may see (V-06, #122), the open ones first, then the newest.</summary>
/// <param name="CanCreate">Whether the caller may make a remark here: a verified scholar, on a published article outside the trash.</param>
public sealed record ArticleRemarkListDto(bool CanCreate, IReadOnlyList<ArticleRemarkDto> Items);

/// <summary>A new remark (V-06, #122).</summary>
/// <param name="RevisionNumber">The revision the scholar read; it must still be the article's latest.</param>
/// <param name="ParagraphId">The paragraph, by the id the revision's snapshot gives it.</param>
/// <param name="OpinionId">One opinion of a block of two or more, by the snapshot's id; null for the whole paragraph.</param>
/// <param name="Body">The remark: plain text, line breaks kept, at most 4000 characters.</param>
public sealed record ArticleRemarkCreateDto(int RevisionNumber, int ParagraphId, int? OpinionId, string? Body);

/// <summary>A reply in a remark's thread.</summary>
public sealed record ArticleRemarkReplyDto(string? Body);

/// <summary>Closing a remark: <see cref="ArticleRemarkStatus.Resolved"/> (fixed) or <see cref="ArticleRemarkStatus.Closed"/> (no change), with an optional last message.</summary>
public sealed record ArticleRemarkCloseDto(ArticleRemarkStatus Outcome, string? Message);

/// <summary>Reopening a closed remark, with an optional message saying why.</summary>
public sealed record ArticleRemarkReopenDto(string? Message);

/// <summary>One of a scholar's remarks, for their history across articles (V-07, #123).</summary>
/// <param name="ArticleTitle">The article's title now.</param>
/// <param name="IsAvailable">True while the article is published, so its review page (with the thread) opens.</param>
/// <param name="RevisionNumber">The revision the remark was made on.</param>
/// <param name="Excerpt">The block's text in that revision, as plain text.</param>
/// <param name="MessageCount">How many messages the thread has, the remark's first one included.</param>
public sealed record ScholarRemarkHistoryItemDto(
    int RemarkId,
    int ArticleId,
    string ArticleTitle,
    bool IsAvailable,
    int RevisionNumber,
    bool OnOpinion,
    string Excerpt,
    ArticleRemarkStatus Status,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int MessageCount);

/// <summary>
/// A page of a scholar's remarks across articles (V-07, #123), the latest changed first; a trashed
/// article's remarks are not in it (only the editors see them).
/// </summary>
/// <param name="OpenTotal">How many of the scholar's remarks are open, whatever the filter.</param>
public sealed record ScholarRemarkHistoryPageDto(
    IReadOnlyList<ScholarRemarkHistoryItemDto> Items, int Total, int Page, int PageSize, int OpenTotal);
