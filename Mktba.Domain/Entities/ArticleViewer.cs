namespace Mktba.Domain.Entities
{
    /// <summary>
    /// The per-article rights of whoever is reading or editing (U-02, #30), in one place: what they may
    /// see and do with one article given its owners. Owners are the article's author and co-authors.
    /// The API builds a viewer from the caller's role: <see cref="EditsAnyArticle"/> and
    /// <see cref="ReviewsArticles"/> from its named policies, <see cref="UserId"/> only for roles that
    /// may write articles at all, so a co-author demoted to Reader loses the rights an owner has.
    /// </summary>
    /// <param name="UserId">The signed-in user whose ownership counts, or null.</param>
    /// <param name="EditsAnyArticle">Reads every status of, and changes, any article (Admin).</param>
    /// <param name="ReviewsArticles">Makes any status change, publication included (Admin, D4).</param>
    public sealed record ArticleViewer(int? UserId, bool EditsAnyArticle, bool ReviewsArticles)
    {
        /// <summary>An anonymous reader: Published articles only, no changes.</summary>
        public static ArticleViewer Anonymous { get; } = new(null, false, false);

        /// <summary>Whether the viewer is the article's author or one of its co-authors.</summary>
        public bool IsOwner(int? authorId, IEnumerable<int> coAuthorIds) =>
            UserId is int id && (authorId == id || coAuthorIds.Contains(id));

        /// <summary>
        /// Whether the viewer may change the article's content and custom schools, and read its
        /// drafts and history: any article for an admin, their own for an author.
        /// </summary>
        public bool CanEdit(int? authorId, IEnumerable<int> coAuthorIds) =>
            EditsAnyArticle || IsOwner(authorId, coAuthorIds);

        /// <summary>Whether the viewer may read the article: Published for everyone, any status for those who may edit it.</summary>
        public bool CanSee(ArticleStatus status, int? authorId, IEnumerable<int> coAuthorIds) =>
            status == ArticleStatus.Published || CanEdit(authorId, coAuthorIds);

        /// <summary>
        /// Whether the viewer may move the article from <paramref name="from"/> to <paramref name="to"/>:
        /// a reviewer any move, an owner only the author's own moves
        /// (<see cref="ArticleStatusTransitions.IsAuthorMove"/>). Whether the move exists at all is
        /// <see cref="ArticleStatusTransitions.IsAllowed"/>'s question.
        /// </summary>
        public bool CanChangeStatus(ArticleStatus from, ArticleStatus to, int? authorId, IEnumerable<int> coAuthorIds) =>
            ReviewsArticles || (CanEdit(authorId, coAuthorIds) && ArticleStatusTransitions.IsAuthorMove(from, to));

        public bool CanEdit(Article article) => CanEdit(article.AuthorId, CoAuthorIds(article));

        public bool CanSee(Article article) => CanSee(article.Status, article.AuthorId, CoAuthorIds(article));

        private static IEnumerable<int> CoAuthorIds(Article article) => article.CoAuthors.Select(coAuthor => coAuthor.UserId);
    }
}
