namespace Mktba.Application.Services
{
    /// <summary>Rules of the article hierarchy that need no database.</summary>
    public static class ArticleTreeRules
    {
        /// <summary>
        /// Whether <paramref name="candidateParentId"/> is <paramref name="articleId"/> itself or one of
        /// its descendants, i.e. whether making it the parent would close a cycle. Walks up from the
        /// candidate through <paramref name="parentIds"/> (article id to parent id); a cycle already in
        /// the data that does not pass through the article stops the walk instead of looping.
        /// </summary>
        public static bool IsSelfOrDescendant(IReadOnlyDictionary<int, int?> parentIds, int articleId, int candidateParentId)
        {
            var visited = new HashSet<int>();
            int? current = candidateParentId;
            while (current is int id && visited.Add(id))
            {
                if (id == articleId)
                {
                    return true;
                }

                current = parentIds.GetValueOrDefault(id);
            }

            return false;
        }
    }
}
