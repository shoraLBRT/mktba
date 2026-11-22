using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services.Analytics;

/// <summary>
/// The search analytics of the admin dashboard (N-06, #100): what readers look for with the site's
/// own search and which queries found nothing — a list of the topics the site lacks. Read from the
/// daily summaries (N-04, #98), never from raw events. A query is counted for a day only when at
/// least <see cref="AnalyticsOptions.SearchQueryMinSearchers"/> distinct visitors made it that day
/// (k-anonymity: a phrase one person typed is never shown); the totals count every search. Search
/// phrases from external search engines stay in Yandex Metrika (D7, #88).
/// </summary>
public class SearchAnalyticsService
{
    public const int DefaultDays = SiteAnalyticsService.DefaultDays;
    public const int MaxDays = SiteAnalyticsService.MaxDays;
    public const int QueryCount = 20;

    private readonly AnalyticsSummaryRepository _summaries;
    private readonly TimeProvider _clock;
    private readonly AnalyticsOptions _options;

    public SearchAnalyticsService(AnalyticsSummaryRepository summaries, TimeProvider clock, IOptions<AnalyticsOptions> options)
    {
        _summaries = summaries;
        _clock = clock;
        _options = options.Value;
    }

    /// <summary>The last <paramref name="days"/> UTC days (kept within 1 to <see cref="MaxDays"/>), today included.</summary>
    public async Task<SearchAnalyticsDto> GetAsync(int days, CancellationToken cancellationToken = default)
    {
        var count = Math.Clamp(days, 1, MaxDays);
        var to = DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime);
        var from = to.AddDays(-(count - 1));
        var minSearchers = _options.MinSearchers;

        var built = await _summaries.GetSiteDaysAsync(from, to, cancellationToken);
        var totals = new SearchAnalyticsTotalsDto(built.Sum(d => d.Searches), built.Sum(d => d.SearchesWithoutResults));

        var top = await _summaries.GetSearchQueriesAsync(from, to, minSearchers, withoutResultsOnly: false, QueryCount, cancellationToken);
        var withoutResults = await _summaries.GetSearchQueriesAsync(from, to, minSearchers, withoutResultsOnly: true, QueryCount, cancellationToken);

        return new SearchAnalyticsDto(
            count,
            from,
            to,
            totals,
            top.Select(ToDto).ToList(),
            withoutResults.Select(ToDto).ToList(),
            minSearchers,
            built.Count == 0 ? null : built.Max(d => d.AggregatedAtUtc));
    }

    private static SearchQueryTotalDto ToDto(AnalyticsSearchTotal total)
        => new(total.Query, total.Searches, total.Searchers, total.SearchesWithoutResults);
}
