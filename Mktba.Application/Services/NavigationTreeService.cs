using Mktba.Application.DTOs;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services
{
    public class NavigationTreeService
    {
        private readonly ArticleRepository _articleRepository;

        public NavigationTreeService(ArticleRepository articleRepository)
        {
            _articleRepository = articleRepository;
        }

        /// <summary>
        /// Builds the article tree. Without <paramref name="includeUnpublished"/> (anonymous readers)
        /// only Published articles are returned, and a Published article whose parent is not
        /// Published is hidden together with its subtree. Editors get every article; an article
        /// whose parent no longer exists becomes a root.
        /// </summary>
        public async Task<List<NavigationArticleDto>> GetTreeAsync(bool includeUnpublished)
        {
            var rows = await _articleRepository.GetNavigationRowsAsync(publishedOnly: !includeUnpublished);
            var lookup = rows
                .Select(row => new NavigationArticleDto
                {
                    Id = row.Id,
                    Title = row.Title,
                    Slug = row.Slug,
                    ParentArticleId = row.ParentArticleId,
                    Status = row.Status,
                    HasContent = row.HasContent,
                    Children = new List<NavigationArticleDto>()
                })
                .ToDictionary(article => article.Id);

            var roots = new List<NavigationArticleDto>();

            foreach (var article in lookup.Values)
            {
                if (article.ParentArticleId is null)
                {
                    roots.Add(article);
                    continue;
                }

                if (lookup.TryGetValue(article.ParentArticleId.Value, out var parent))
                {
                    parent.Children ??= new List<NavigationArticleDto>();
                    parent.Children.Add(article);
                }
                else if (includeUnpublished)
                {
                    roots.Add(article);
                }
            }

            return roots;
        }
    }
}
