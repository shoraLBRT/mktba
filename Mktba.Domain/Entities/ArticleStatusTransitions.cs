namespace Mktba.Domain.Entities
{
    /// <summary>
    /// The single place that says which status changes are allowed. Today every editor is an admin,
    /// so the rules do not depend on the role; per-role rules arrive with U-01/U-02.
    /// </summary>
    public static class ArticleStatusTransitions
    {
        private static readonly IReadOnlyDictionary<ArticleStatus, ArticleStatus[]> Allowed =
            new Dictionary<ArticleStatus, ArticleStatus[]>
            {
                // Submit for review.
                [ArticleStatus.Draft] = new[] { ArticleStatus.InReview },
                // Approve, or return to the author.
                [ArticleStatus.InReview] = new[] { ArticleStatus.Published, ArticleStatus.Draft },
                // Withdraw from the site.
                [ArticleStatus.Published] = new[] { ArticleStatus.Archived },
                // Revive: back to a draft, so it is published again only through review (D4).
                [ArticleStatus.Archived] = new[] { ArticleStatus.Draft },
            };

        /// <summary>The statuses an article in <paramref name="from"/> may move to.</summary>
        public static IReadOnlyList<ArticleStatus> AllowedFrom(ArticleStatus from) =>
            Allowed.TryGetValue(from, out var targets) ? targets : Array.Empty<ArticleStatus>();

        public static bool IsAllowed(ArticleStatus from, ArticleStatus to) => AllowedFrom(from).Contains(to);
    }
}
