namespace Mktba.Domain.Entities;

/// <summary>
/// One user's autosaved, unsaved edits of one article (E-02, #75; maintainer decision B,
/// 2026-11-21). It is neither a revision nor the working copy: readers never see it, it never
/// enters the history, and «Сохранить» turns the edits into a revision and drops it. Each user has
/// at most one per article — the author and every co-author their own — and at most one with no
/// article, for the new-article page.
/// </summary>
public class ArticleDraft
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public User User { get; set; } = null!;

    /// <summary>The article being edited; null for an article not created yet.</summary>
    public int? ArticleId { get; set; }

    public Article? Article { get; set; }

    /// <summary>
    /// The editor's state as JSON (jsonb in PostgreSQL), stored as the editor sent it: a draft may
    /// be half-finished, so it is not validated as article content until it is saved.
    /// </summary>
    public string Snapshot { get; set; } = string.Empty;

    /// <summary>
    /// The article's <see cref="Article.UpdatedAt"/> the edits started from (null for a new
    /// article), so the editor can warn that the article was saved since.
    /// </summary>
    public DateTime? BaseUpdatedAt { get; set; }

    /// <summary>When the draft was last written (UTC); a draft untouched for 30 days is deleted.</summary>
    public DateTime UpdatedAt { get; set; }
}
