namespace Mktba.Domain.Entities;

/// <summary>
/// A reader's report of a comment (C-02, #128): one per reporter and comment. Enough reports newer
/// than the comment's last moderation (<c>Comments:ReportsToHold</c>) hold it for a moderator.
/// </summary>
public class ArticleCommentReport
{
    /// <summary>The longest note kept, after trimming.</summary>
    public const int NoteMaxLength = 500;

    public int Id { get; set; }

    public int CommentId { get; set; }

    public ArticleComment Comment { get; set; } = null!;

    public int ReporterId { get; set; }

    public User Reporter { get; set; } = null!;

    public ArticleCommentReportReason Reason { get; set; }

    /// <summary>What the reporter added; null when nothing.</summary>
    public string? Note { get; set; }

    /// <summary>When it was made (UTC).</summary>
    public DateTime CreatedAt { get; set; }
}

/// <summary>What is wrong with a reported comment (C-02, #128). Stored by name.</summary>
public enum ArticleCommentReportReason
{
    Spam = 1,

    /// <summary>Insults, hostility.</summary>
    Abuse = 2,

    /// <summary>Not about the article.</summary>
    Offtopic = 3,

    Other = 4,
}
