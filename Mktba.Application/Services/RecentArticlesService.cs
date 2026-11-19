using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services
{
    /// <summary>The home page's lists of new and updated articles (R-05, #41).</summary>
    public class RecentArticlesService
    {
        public const int DefaultLimit = 6;
        public const int MaxLimit = 20;

        private readonly ArticleRepository _articleRepository;

        public RecentArticlesService(ArticleRepository articleRepository)
        {
            _articleRepository = articleRepository;
        }

        /// <summary>
        /// The articles of one language an anonymous reader can reach, by the navigation tree's rule:
        /// Published, with every ancestor Published too. Stubs with no content are left out. The same
        /// lists for every caller.
        /// </summary>
        /// <param name="requestedLocale">Language of the lists; null or blank means <see cref="Locales.Default"/>.</param>
        /// <param name="limit">Entries per list; kept within 1 to <see cref="MaxLimit"/>.</param>
        /// <exception cref="ValidationException">locale_unsupported.</exception>
        public async Task<RecentArticlesDto> GetAsync(string? requestedLocale, int limit, CancellationToken cancellationToken = default)
        {
            var locale = Locales.Normalize(requestedLocale)
                ?? throw new ValidationException(AppErrors.LocaleUnsupported(requestedLocale!));
            var take = Math.Clamp(limit, 1, MaxLimit);

            var rows = await _articleRepository.GetRecentRowsAsync(cancellationToken);
            var byId = rows.ToDictionary(row => row.Id);
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

            var listed = rows
                .Where(row => row.HasContent && row.PublishedAt is not null && row.Locale == locale && IsReachable(row))
                .Select(row => new RecentArticleDto(row.Id, row.Title, row.Slug, row.Summary, row.PublishedAt!.Value, row.UpdatedAt))
                .ToList();

            return new RecentArticlesDto(
                listed
                    .OrderByDescending(article => article.PublishedAt)
                    .ThenByDescending(article => article.Id)
                    .Take(take)
                    .ToList(),
                listed
                    .Where(article => article.UpdatedAt > article.PublishedAt)
                    .OrderByDescending(article => article.UpdatedAt)
                    .ThenByDescending(article => article.Id)
                    .Take(take)
                    .ToList());
        }
    }
}
