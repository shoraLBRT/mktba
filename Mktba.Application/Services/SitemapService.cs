using Mktba.Application.DTOs;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services
{
    /// <summary>The articles search engines are pointed at (O-06, #57).</summary>
    public class SitemapService
    {
        private readonly ArticleRepository _articleRepository;

        public SitemapService(ArticleRepository articleRepository)
        {
            _articleRepository = articleRepository;
        }

        /// <summary>
        /// The articles an anonymous reader can reach, by the navigation tree's rule: Published, with
        /// every ancestor Published too (an article under a hidden parent is hidden with its subtree).
        /// Articles marked noindex are left out; their children are not. Ordered by id.
        /// </summary>
        public async Task<List<SitemapArticleDto>> GetArticlesAsync(CancellationToken cancellationToken = default)
        {
            var rows = await _articleRepository.GetSitemapRowsAsync(cancellationToken);
            var byId = rows.ToDictionary(row => row.Id);
            var reachable = new Dictionary<int, bool>();

            bool IsReachable(ArticleSitemapRow row)
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

            return rows
                .Where(row => !row.NoIndex && IsReachable(row))
                .Select(row => new SitemapArticleDto(row.Slug, row.Locale, row.TranslationGroupId, row.UpdatedAt))
                .ToList();
        }
    }
}
