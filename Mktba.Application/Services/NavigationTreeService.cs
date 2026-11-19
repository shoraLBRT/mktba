using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
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
        /// Builds the article tree from the articles <paramref name="viewer"/> may see
        /// (<see cref="ArticleViewer.CanSee(Article)"/>): an article whose parent the viewer may not
        /// see is hidden together with its subtree, unless the viewer may edit the article: then it
        /// becomes a root, as does an article whose parent no longer exists. Each node says whether
        /// the viewer may edit it.
        /// </summary>
        public async Task<List<NavigationArticleDto>> GetTreeAsync(ArticleViewer viewer)
        {
            var rows = await _articleRepository.GetNavigationRowsAsync(viewer);
            var lookup = rows
                .Select(row => new NavigationArticleDto
                {
                    Id = row.Id,
                    Title = row.Title,
                    Slug = row.Slug,
                    ParentArticleId = row.ParentArticleId,
                    Status = row.Status,
                    HasContent = row.HasContent,
                    CanEdit = row.CanEdit,
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
                else if (article.CanEdit)
                {
                    roots.Add(article);
                }
            }

            return roots;
        }
    }
}
