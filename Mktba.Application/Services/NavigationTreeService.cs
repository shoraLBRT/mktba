using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
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
        /// <param name="requestedLocale">
        /// Null or blank: every language in one tree (the admin's). A language (I-06, #110): only its
        /// articles; an article hangs under its nearest ancestor of that language, and becomes a root
        /// when it has none (a translation whose parent was picked in another language). An ancestor
        /// of another language still hides it when the viewer may not see that ancestor's own chain.
        /// An unsupported language fails with <c>locale_unsupported</c>.
        /// </param>
        public async Task<List<NavigationArticleDto>> GetTreeAsync(ArticleViewer viewer, string? requestedLocale = null)
        {
            var locale = string.IsNullOrWhiteSpace(requestedLocale)
                ? null
                : Locales.Normalize(requestedLocale) ?? throw new ValidationException(AppErrors.LocaleUnsupported(requestedLocale));

            var rows = await _articleRepository.GetNavigationRowsAsync(viewer);
            var verified = await _articleRepository.GetVerifiedIdsAsync();
            var rowsById = rows.ToDictionary(row => row.Id);
            var lookup = rows
                .Where(row => locale is null || row.Locale == locale)
                .Select(row => new NavigationArticleDto
                {
                    Id = row.Id,
                    Title = row.Title,
                    Slug = row.Slug,
                    Locale = row.Locale,
                    ParentArticleId = row.ParentArticleId,
                    Status = row.Status,
                    HasContent = row.HasContent,
                    CanEdit = row.CanEdit,
                    IsVerified = verified.Contains(row.Id),
                    Children = new List<NavigationArticleDto>()
                })
                .ToDictionary(article => article.Id);

            var roots = new List<NavigationArticleDto>();

            foreach (var article in lookup.Values)
            {
                switch (FindPlace(article.ParentArticleId, rowsById, lookup))
                {
                    case { Parent: { } parent }:
                        parent.Children ??= new List<NavigationArticleDto>();
                        parent.Children.Add(article);
                        break;
                    case { IsRoot: true }:
                        roots.Add(article);
                        break;
                    default:
                        if (article.CanEdit) roots.Add(article);
                        break;
                }
            }

            return roots;
        }

        private readonly record struct Place(NavigationArticleDto? Parent, bool IsRoot);

        /// <summary>
        /// Where an article with this parent goes: under the nearest ancestor in <paramref name="lookup"/>
        /// (the tree's language; skipping ancestors of other languages), at the root when the chain ends
        /// without one, or nowhere (neither) when an ancestor is missing — hidden from the viewer or gone.
        /// </summary>
        private static Place FindPlace(
            int? parentId,
            IReadOnlyDictionary<int, ArticleNavigationRow> rowsById,
            IReadOnlyDictionary<int, NavigationArticleDto> lookup)
        {
            var seen = new HashSet<int>();
            while (parentId is { } id)
            {
                if (lookup.TryGetValue(id, out var parent)) return new Place(parent, false);
                if (!rowsById.TryGetValue(id, out var row) || !seen.Add(id)) return new Place(null, false);
                parentId = row.ParentArticleId;
            }

            return new Place(null, true);
        }
    }
}
