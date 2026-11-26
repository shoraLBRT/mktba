namespace Mktba.Domain.Entities;

/// <summary>
/// What a scholar's review of a revision covers, reduced to a hash (V-05, #121): one row per revision
/// and scope — the whole article (<see cref="WholeArticle"/>) and each canonical school, whose readers
/// see only their school's opinion in a block of opinions. Two revisions with the same hash for a
/// scope read the same to a scholar of that scope, so a review of one is still current for the other;
/// a different hash is a substantial edit (decision D5, #115). Derived from the revision's snapshot
/// when the revision is written, and filled at startup for revisions written before.
/// </summary>
public class ArticleRevisionFingerprint
{
    /// <summary>The scope of a review that covers the whole article (a scholar without a school).</summary>
    public const string WholeArticle = "";

    /// <summary>The length of <see cref="Hash"/>: SHA-256 as lowercase hex.</summary>
    public const int HashLength = 64;

    public int RevisionId { get; set; }

    public ArticleRevision Revision { get; set; } = null!;

    /// <summary>
    /// <see cref="WholeArticle"/>, or the slug of a canonical school — the same value
    /// <see cref="ArticleReview.Mazhab"/> keeps.
    /// </summary>
    public string Scope { get; set; } = WholeArticle;

    public string Hash { get; set; } = string.Empty;
}
