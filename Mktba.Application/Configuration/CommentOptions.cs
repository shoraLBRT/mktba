namespace Mktba.Application.Configuration;

/// <summary>
/// The <c>Comments</c> configuration section (C-01, #127; moderation C-02, #128). The per-IP limit on
/// writing, editing, deleting and reporting comments is <c>RateLimiting:Comments</c>; this is the
/// per-account one and the moderation rules.
/// </summary>
public sealed class CommentOptions
{
    public const string SectionName = "Comments";

    /// <summary>
    /// Most comments one account may write in any <see cref="PerUserWindowSeconds"/>, counted from the
    /// table (deleted ones included), so it survives restarts; further ones are answered with 429
    /// <c>comment_limit_reached</c>. Zero or less: no cap.
    /// </summary>
    public int PerUserLimit { get; set; } = 10;

    public int PerUserWindowSeconds { get; set; } = 600;

    /// <summary>
    /// A reader's comments are held for a moderator until this many of theirs have been published
    /// (approved, or written after the first ones were). Other roles are never held for being new.
    /// Zero or less: no premoderation.
    /// </summary>
    public int PremoderateFirst { get; set; } = 1;

    /// <summary>A comment with more links than this is held as spam (every role but an admin). Less than zero: no check.</summary>
    public int MaxLinks { get; set; } = 3;

    /// <summary>Words or phrases that hold a comment as spam, case-insensitively, wherever they occur. Empty: no check.</summary>
    public List<string> BlockedWords { get; set; } = [];

    /// <summary>
    /// A new comment with the same text as one of the author's own written within this many hours is
    /// held as spam. Zero or less: no check.
    /// </summary>
    public int DuplicateWindowHours { get; set; } = 24;

    /// <summary>
    /// A published comment is held for a moderator once this many readers have reported it since it
    /// was last moderated. Zero or less: reports never hold a comment (moderators still see them).
    /// </summary>
    public int ReportsToHold { get; set; } = 3;
}
