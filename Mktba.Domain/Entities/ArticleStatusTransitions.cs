namespace Mktba.Domain.Entities
{
    /// <summary>
    /// The single place that says which status changes exist. Who may make which of them is
    /// <see cref="ArticleViewer.CanChangeStatus"/>: a reviewer any, an author only <see cref="IsAuthorMove"/>.
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

        /// <summary>
        /// The moves an author may make on their own article: submit a draft for review, or take it
        /// back to a draft while it waits. Publishing, archiving and reviving need a reviewer (D4).
        /// </summary>
        public static bool IsAuthorMove(ArticleStatus from, ArticleStatus to) =>
            (from, to) is (ArticleStatus.Draft, ArticleStatus.InReview) or (ArticleStatus.InReview, ArticleStatus.Draft);
    }
}
