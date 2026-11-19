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

        public async Task<List<NavigationArticleDto>> GetTreeAsync()
        {
            var rows = await _articleRepository.GetNavigationRowsAsync();
            var lookup = rows
                .Select(row => new NavigationArticleDto
                {
                    Id = row.Id,
                    Title = row.Title,
                    Slug = row.Slug,
                    ParentArticleId = row.ParentArticleId,
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
                else
                {
                    roots.Add(article);
                }
            }

            return roots;
        }
    }
}
