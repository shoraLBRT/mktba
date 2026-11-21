namespace Mktba.Domain.Entities;

/// <summary>
/// One move of an article's status (A-04, #87): who made it, when, and the optional comment — a
/// reviewer's reason for returning an article to its author, or a note on approval. Append-only:
/// nothing updates or deletes a row (deleting the article drops its log).
/// </summary>
public class ArticleStatusChange
{
    public int Id { get; set; }

    public int ArticleId { get; set; }

    public Article Article { get; set; } = null!;

    public ArticleStatus FromStatus { get; set; }

    public ArticleStatus ToStatus { get; set; }

    /// <summary>Who made the move; null for a deleted user.</summary>
    public int? ChangedById { get; set; }

    public User? ChangedBy { get; set; }

    /// <summary>When the move happened (UTC).</summary>
    public DateTime ChangedAt { get; set; }

    /// <summary>The number of the article's latest revision at the time of the move; null if it had none.</summary>
    public int? RevisionNumber { get; set; }

    /// <summary>The comment given with the move, trimmed; null when none was given.</summary>
    public string? Comment { get; set; }
}
