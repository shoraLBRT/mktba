using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services
{
    /// <summary>
    /// The navigation tree's rule for the flat public lists (new and updated articles, an author's
    /// articles): an anonymous reader reaches a Published article only when every ancestor is
    /// Published too.
    /// </summary>
    internal static class ArticleReachability
    {
        /// <summary>
        /// A check over <paramref name="publishedRows"/>, which must hold every Published article: a row
        /// whose parent is missing from them hangs under a hidden article.
        /// </summary>
        public static Func<ArticleRecentRow, bool> Among(IReadOnlyCollection<ArticleRecentRow> publishedRows)
        {
            var byId = publishedRows.ToDictionary(row => row.Id);
            var reachable = new Dictionary<int, bool>();

            bool IsReachable(ArticleRecentRow row)
            {
                if (reachable.TryGetValue(row.Id, out var known))
                {
                    return known;
                }

                // Marked first, so a cycle in the parent links ends as unreachable instead of looping.
                reachable[row.Id] = false;
                var result = row.ParentArticleId is not int parentId
                    || (byId.TryGetValue(parentId, out var parent) && IsReachable(parent));
                reachable[row.Id] = result;
                return result;
            }

            return IsReachable;
        }
    }
}
