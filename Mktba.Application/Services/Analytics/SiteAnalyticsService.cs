using Mktba.Application.DTOs;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services.Analytics;

/// <summary>
/// The site-wide statistics of the admin dashboard (N-05, #99): views, visitors and searches per
/// day, the most viewed articles and the mazhabs readers chose, over the last days. Read from the
/// daily summaries (N-04, #98), never from raw events; traffic sources and devices stay in Yandex
/// Metrika (D7, #88).
/// </summary>
public class SiteAnalyticsService
{
    public const int DefaultDays = 30;
    public const int MaxDays = 365;
    public const int TopArticleCount = 10;

    private readonly AnalyticsSummaryRepository _summaries;
    private readonly TimeProvider _clock;

    public SiteAnalyticsService(AnalyticsSummaryRepository summaries, TimeProvider clock)
    {
        _summaries = summaries;
        _clock = clock;
    }

    /// <summary>The last <paramref name="days"/> UTC days (kept within 1 to <see cref="MaxDays"/>), today included.</summary>
    public async Task<SiteAnalyticsDto> GetAsync(int days, CancellationToken cancellationToken = default)
    {
        var count = Math.Clamp(days, 1, MaxDays);
        var to = DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime);
        var from = to.AddDays(-(count - 1));

        var built = (await _summaries.GetSiteDaysAsync(from, to, cancellationToken)).ToDictionary(d => d.Day);
        var daily = Enumerable.Range(0, count)
            .Select(index => from.AddDays(index))
            .Select(day => built.TryGetValue(day, out var row)
                ? new SiteAnalyticsDayDto(day, row.ArticleViews, row.Visitors, row.Searches)
                : new SiteAnalyticsDayDto(day, 0, 0, 0))
            .ToList();
        var totals = new SiteAnalyticsTotalsDto(
            daily.Sum(d => d.ArticleViews), daily.Sum(d => d.Visitors), daily.Sum(d => d.Searches));

        var top = await _summaries.GetTopArticlesAsync(from, to, TopArticleCount, cancellationToken);
        var articleNames = await _summaries.GetArticleNamesAsync(top.Select(t => t.Id).ToList(), cancellationToken);
        var topArticles = top
            .Select(t => articleNames.TryGetValue(t.Id, out var name)
                ? new AnalyticsArticleTotalDto(t.Id, name.Title, name.Slug, t.Views, t.Readers)
                : new AnalyticsArticleTotalDto(t.Id, null, null, t.Views, t.Readers))
            .ToList();

        // N-11 (#153): one row per metric; a period's p75 is its days' p75s averaged by samples (an estimate,
        // the raw values are not kept in the summaries), the ratings are exact sums.
        var vitalDays = await _summaries.GetWebVitalDaysAsync(from, to, cancellationToken);
        var webVitals = WebVitals.Metrics
            .Select(metric =>
            {
                var rows = vitalDays.Where(d => d.Metric == metric).ToList();
                var samples = rows.Sum(d => d.Samples);
                return new SiteWebVitalDto(
                    metric,
                    samples,
                    samples == 0 ? null : rows.Sum(d => d.P75 * d.Samples) / samples,
                    rows.Sum(d => d.Good),
                    rows.Sum(d => d.NeedsImprovement),
                    rows.Sum(d => d.Poor));
            })
            .ToList();

        var bySchool = await _summaries.GetSchoolViewsAsync(from, to, cancellationToken);
        var schoolNames = await _summaries.GetSchoolNamesAsync(bySchool.Select(s => s.Id).ToList(), cancellationToken);
        var schools = bySchool
            .Select(s => new AnalyticsSchoolTotalDto(s.Id, schoolNames.GetValueOrDefault(s.Id), s.Views, s.Readers))
            .ToList();

        return new SiteAnalyticsDto(
            count,
            from,
            to,
            totals,
            daily,
            topArticles,
            schools,
            Math.Max(0, totals.ArticleViews - schools.Sum(s => s.Views)),
            built.Count == 0 ? null : built.Values.Max(d => d.AggregatedAtUtc),
            webVitals);
    }
}
