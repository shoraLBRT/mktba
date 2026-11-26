namespace Mktba.Domain.Entities;

/// <summary>
/// An immutable snapshot of an article taken at one save. Revisions are only ever added: a rollback
/// writes a new revision that copies an old snapshot, and nothing updates or deletes a revision
/// (except deleting the article itself, which drops its history).
/// </summary>
public class ArticleRevision
{
    public int Id { get; set; }

    public int ArticleId { get; set; }

    public Article Article { get; set; } = null!;

    /// <summary>1, 2, 3… per article, in the order the saves happened.</summary>
    public int Number { get; set; }

    /// <summary>When the save happened (UTC).</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>Who saved; null for the backfilled first revision or a deleted user.</summary>
    public int? AuthorId { get; set; }

    public User? Author { get; set; }

    /// <summary>The editor's optional note about the change.</summary>
    public string? Comment { get; set; }

    /// <summary>
    /// The article as saved, as JSON of the versioned snapshot DTO (jsonb in PostgreSQL). It is
    /// self-contained: rendering it needs no join to the mutable working-copy tables.
    /// </summary>
    public string Snapshot { get; set; } = string.Empty;

    /// <summary>
    /// What a review of this revision covers, per scope (V-05, #121): derived from <see cref="Snapshot"/>,
    /// so it never changes either.
    /// </summary>
    public List<ArticleRevisionFingerprint> Fingerprints { get; set; } = [];
}
