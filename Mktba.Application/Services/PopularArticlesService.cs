using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Analytics;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services
{
    /// <summary>
    /// The home page's list of popular articles (R-05, #41): the most viewed over the last
    /// <see cref="Days"/> days, counted from the daily analytics summaries (N-04, #98), never from raw
    /// events. The window is a default chosen without the owner and open for them to change.
    /// </summary>
    public class PopularArticlesService
    {
        /// <summary>Views are counted over the last 30 UTC days, today included.</summary>
        public const int Days = 30;
        public const int DefaultLimit = RecentArticlesService.DefaultLimit;
        public const int MaxLimit = RecentArticlesService.MaxLimit;

        private readonly ArticleRepository _articleRepository;
        private readonly AnalyticsSummaryRepository _summaries;
        private readonly TimeProvider _clock;

        public PopularArticlesService(ArticleRepository articleRepository, AnalyticsSummaryRepository summaries, TimeProvider clock)
        {
            _articleRepository = articleRepository;
            _summaries = summaries;
            _clock = clock;
        }

        /// <summary>
        /// The articles of one language an anonymous reader can reach, by the rule of
        /// <see cref="RecentArticlesService"/>: Published, every ancestor Published, not in the trash, no
        /// empty stubs. Most views first, then the newest publication; the same list for every caller.
        /// </summary>
        /// <param name="requestedLocale">Language of the list; null or blank means <see cref="Locales.Default"/>.</param>
        /// <param name="limit">Entries of the list; kept within 1 to <see cref="MaxLimit"/>.</param>
        /// <exception cref="ValidationException">locale_unsupported.</exception>
        public async Task<PopularArticlesDto> GetAsync(string? requestedLocale, int limit, CancellationToken cancellationToken = default)
        {
            var locale = Locales.Normalize(requestedLocale)
                ?? throw new ValidationException(AppErrors.LocaleUnsupported(requestedLocale!));
            var take = Math.Clamp(limit, 1, MaxLimit);
            var (from, to) = AnalyticsPeriod.Last(Days, DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime));

            var views = await _summaries.GetArticleViewsAsync(from, to, cancellationToken);
            if (views.Count == 0)
            {
                return new PopularArticlesDto(Days, []);
            }

            var rows = await _articleRepository.GetRecentRowsAsync(cancellationToken);
            var isReachable = ArticleReachability.Among(rows);
            var verified = await _articleRepository.GetVerifiedIdsAsync(cancellationToken);

            var items = rows
                .Where(row => row.HasContent && row.PublishedAt is not null && row.Locale == locale && isReachable(row))
                .Select(row => (Row: row, Views: views.GetValueOrDefault(row.Id)?.Views ?? 0))
                .Where(x => x.Views > 0)
                .OrderByDescending(x => x.Views)
                .ThenByDescending(x => x.Row.PublishedAt)
                .ThenByDescending(x => x.Row.Id)
                .Take(take)
                .Select(x => new PopularArticleDto(x.Row.Id, x.Row.Title, x.Row.Slug, x.Row.Summary, verified.Contains(x.Row.Id)))
                .ToList();

            return new PopularArticlesDto(Days, items);
        }
    }
}
