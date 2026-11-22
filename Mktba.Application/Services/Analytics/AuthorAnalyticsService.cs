using Mktba.Application.DTOs;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services.Analytics;

/// <summary>
/// The author dashboard (P-03, #91): the signed-in user's own articles only — views and readers per
/// day, the most viewed articles, how far they are read and the mazhabs their readers chose. Read
/// from the daily summaries (N-04, #98), never from raw events. External search phrases stay in
/// Yandex Metrika (D7, #88), and the site's own search events name no article, so there are none here.
/// </summary>
public class AuthorAnalyticsService
{
    public const int DefaultDays = 30;
    public const int MaxDays = 365;
    public const int TopArticleCount = 10;

    private readonly AnalyticsSummaryRepository _summaries;
    private readonly TimeProvider _clock;

    public AuthorAnalyticsService(AnalyticsSummaryRepository summaries, TimeProvider clock)
    {
        _summaries = summaries;
        _clock = clock;
    }

    /// <summary>The last <paramref name="days"/> UTC days (kept within 1 to <see cref="MaxDays"/>) of <paramref name="userId"/>'s articles, today included.</summary>
    public async Task<AuthorAnalyticsDto> GetAsync(int userId, int days, CancellationToken cancellationToken = default)
    {
        var count = Math.Clamp(days, 1, MaxDays);
        var to = DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime);
        var from = to.AddDays(-(count - 1));

        // Readers of several articles on one day are counted once, so the days come from the
        // author's own summary rather than from adding up the articles.
        var authorDays = (await _summaries.GetAuthorDaysAsync(userId, from, to, cancellationToken)).ToDictionary(d => d.Day);
        var daily = Enumerable.Range(0, count)
            .Select(index => from.AddDays(index))
            .Select(day => authorDays.TryGetValue(day, out var row)
                ? new AuthorAnalyticsDayDto(day, row.Views, row.Readers)
                : new AuthorAnalyticsDayDto(day, 0, 0))
            .ToList();

        // The articles, depth and mazhabs: only what the user writes or co-writes now, so an article
        // handed to someone else is no longer shown to them.
        var articleIds = await _summaries.GetAuthoredArticleIdsAsync(userId, cancellationToken);
        var reading = await _summaries.GetArticleReadingAsync(from, to, articleIds, cancellationToken);
        var names = await _summaries.GetArticleNamesAsync(reading.Select(r => r.Id).ToList(), cancellationToken);
        var topArticles = reading
            .Where(r => names.ContainsKey(r.Id))
            .Take(TopArticleCount)
            .Select(r => new AuthorArticleTotalDto(r.Id, names[r.Id].Title, names[r.Id].Slug, r.Views, r.Readers, DepthOf(r)))
            .ToList();
        var depth = new ReadDepthDto(
            reading.Sum(r => r.Views),
            reading.Sum(r => r.ReachedDepth25),
            reading.Sum(r => r.ReachedDepth50),
            reading.Sum(r => r.ReachedDepth75),
            reading.Sum(r => r.ReachedDepth100));

        var bySchool = await _summaries.GetSchoolViewsOfArticlesAsync(from, to, articleIds, cancellationToken);
        var schoolNames = await _summaries.GetSchoolNamesAsync(bySchool.Select(s => s.Id).ToList(), cancellationToken);
        var schools = bySchool
            .Select(s => new AnalyticsSchoolTotalDto(s.Id, schoolNames.GetValueOrDefault(s.Id), s.Views, s.Readers))
            .ToList();

        var siteDays = await _summaries.GetSiteDaysAsync(from, to, cancellationToken);

        return new AuthorAnalyticsDto(
            count,
            from,
            to,
            new AuthorAnalyticsTotalsDto(daily.Sum(d => d.Views), daily.Sum(d => d.Readers), reading.Count),
            daily,
            topArticles,
            depth,
            schools,
            Math.Max(0, depth.Views - schools.Sum(s => s.Views)),
            siteDays.Count == 0 ? null : siteDays.Max(d => d.AggregatedAtUtc));
    }

    private static ReadDepthDto DepthOf(AnalyticsArticleReading reading)
        => new(reading.Views, reading.ReachedDepth25, reading.ReachedDepth50, reading.ReachedDepth75, reading.ReachedDepth100);
}
