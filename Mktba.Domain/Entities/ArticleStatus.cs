namespace Mktba.Domain.Entities
{
    /// <summary>
    /// Publication status of an article. Only <see cref="Published"/> articles are visible to
    /// anonymous readers; the allowed moves between statuses live in <see cref="ArticleStatusTransitions"/>.
    /// Stored as a string, so the member names are part of the database contract.
    /// </summary>
    public enum ArticleStatus
    {
        /// <summary>Being written; visible to editors only.</summary>
        Draft,
        /// <summary>Submitted for approval by an admin (D4).</summary>
        InReview,
        /// <summary>Approved and visible on the public site.</summary>
        Published,
        /// <summary>Withdrawn from the public site but kept.</summary>
        Archived
    }
}
