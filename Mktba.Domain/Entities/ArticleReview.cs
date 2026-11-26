namespace Mktba.Domain.Entities;

/// <summary>What a scholar says of the revision they reviewed (V-03, #119). Stored by name.</summary>
public enum ArticleReviewVerdict
{
    /// <summary>«Подтверждаю»: the scholar confirms the revision; a comment is optional.</summary>
    Confirmed = 1,

    /// <summary>«Подтверждаю с замечаниями»: confirmed, with remarks in the required comment.</summary>
    ConfirmedWithRemarks = 2,

    /// <summary>«Есть ошибки»: the revision has errors, named in the required comment.</summary>
    HasErrors = 3,
}

/// <summary>
/// A verified scholar's review of one revision of a published article (V-03, #119; decision D5, #115:
/// the mark belongs to a revision). A scholar has at most one review per revision; reviewing the same
/// revision again replaces the verdict and the comment, while the reviews of earlier revisions stay
/// as they were — the history the widget (V-04, #120) and the staleness rule (V-05, #121) read.
/// </summary>
public class ArticleReview
{
    /// <summary>The longest comment kept.</summary>
    public const int CommentMaxLength = 4000;

    public int Id { get; set; }

    /// <summary>The article reviewed (the revision's article, kept for the per-article queries).</summary>
    public int ArticleId { get; set; }

    public Article Article { get; set; } = null!;

    /// <summary>The revision the verdict is about.</summary>
    public int RevisionId { get; set; }

    public ArticleRevision Revision { get; set; } = null!;

    /// <summary>The scholar; their reviews go when the user is deleted.</summary>
    public int ScholarId { get; set; }

    public User Scholar { get; set; } = null!;

    public ArticleReviewVerdict Verdict { get; set; }

    /// <summary>Plain text, line breaks kept; required unless the verdict is <see cref="ArticleReviewVerdict.Confirmed"/>.</summary>
    public string? Comment { get; set; }

    /// <summary>
    /// The scope: the slug of the canonical school the scholar follows (from their approved
    /// application) when the review covers only what readers of that school see; null when it covers
    /// the whole article.
    /// </summary>
    public string? Mazhab { get; set; }

    /// <summary>When the scholar first reviewed this revision (UTC).</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>When the verdict or the comment was last given (UTC); equal to <see cref="CreatedAt"/> until a replacement.</summary>
    public DateTime UpdatedAt { get; set; }
}
