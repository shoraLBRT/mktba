using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services.Analytics;

/// <summary>
/// One article's statistics (N-09, #103): views and readers per day, how far it is read, the mazhabs
/// its readers chose, opinion switches and internal link clicks. Read from the daily summaries
/// (N-04, #98), never from raw events. Who may read them (an admin, the article's author or
/// co-author) is checked by the endpoint, as for the article's history.
/// </summary>
public class ArticleAnalyticsService
{
    public const int DefaultDays = 30;
    public const int MaxDays = 365;

    private readonly AnalyticsSummaryRepository _summaries;
    private readonly TimeProvider _clock;

    public ArticleAnalyticsService(AnalyticsSummaryRepository summaries, TimeProvider clock)
    {
        _summaries = summaries;
        _clock = clock;
    }

    /// <summary>The last <paramref name="days"/> UTC days (kept within 1 to <see cref="MaxDays"/>) of one article, today included.</summary>
    /// <exception cref="NotFoundException"><c>article_not_found</c>: no such article.</exception>
    public Task<ArticleAnalyticsDto> GetAsync(int articleId, int days, CancellationToken cancellationToken = default)
        => GetAsync(articleId, AnalyticsPeriod.Last(days, DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime)), cancellationToken);

    /// <summary>The days of <paramref name="period"/> of one article, its totals compared with the period of the same length just before it (N-08, #102).</summary>
    /// <exception cref="NotFoundException"><c>article_not_found</c>: no such article.</exception>
    public async Task<ArticleAnalyticsDto> GetAsync(int articleId, AnalyticsPeriod period, CancellationToken cancellationToken = default)
    {
        var names = await _summaries.GetArticleNamesAsync([articleId], cancellationToken);
        if (!names.TryGetValue(articleId, out var name))
        {
            throw new NotFoundException(AppErrors.ArticleNotFound);
        }

        var (from, to) = period;

        var rows = await _summaries.GetArticleDaysAsync(articleId, from, to, cancellationToken);
        var byDay = rows.ToDictionary(d => d.Day);
        var daily = period.EachDay()
            .Select(day => byDay.TryGetValue(day, out var row)
                ? new ArticleAnalyticsDayDto(day, row.Views, row.Readers, row.OpinionSwitches, row.InternalLinkClicks)
                : new ArticleAnalyticsDayDto(day, 0, 0, 0, 0))
            .ToList();
        var totals = TotalsOf(rows);
        var depth = new ReadDepthDto(
            totals.Views,
            rows.Sum(r => r.ReachedDepth25),
            rows.Sum(r => r.ReachedDepth50),
            rows.Sum(r => r.ReachedDepth75),
            rows.Sum(r => r.ReachedDepth100));

        var bySchool = await _summaries.GetSchoolViewsOfArticlesAsync(from, to, [articleId], cancellationToken);
        var schoolNames = await _summaries.GetSchoolNamesAsync(bySchool.Select(s => s.Id).ToList(), cancellationToken);
        var schools = bySchool
            .Select(s => new AnalyticsSchoolTotalDto(s.Id, schoolNames.GetValueOrDefault(s.Id), s.Views, s.Readers))
            .ToList();

        var siteDays = await _summaries.GetSiteDaysAsync(from, to, cancellationToken);
        var previous = period.Previous;
        var previousRows = await _summaries.GetArticleDaysAsync(articleId, previous.From, previous.To, cancellationToken);

        return new ArticleAnalyticsDto(
            articleId,
            name.Title,
            name.Slug,
            period.Days,
            from,
            to,
            totals,
            daily,
            depth,
            schools,
            Math.Max(0, totals.Views - schools.Sum(s => s.Views)),
            siteDays.Count == 0 ? null : siteDays.Max(d => d.AggregatedAtUtc),
            new AnalyticsPreviousPeriodDto<ArticleAnalyticsTotalsDto>(previous.From, previous.To, TotalsOf(previousRows)));
    }

    private static ArticleAnalyticsTotalsDto TotalsOf(IReadOnlyCollection<AnalyticsArticleDay> rows) => new(
        rows.Sum(r => r.Views),
        rows.Sum(r => r.Readers),
        rows.Sum(r => r.OpinionsShown),
        rows.Sum(r => r.OpinionSwitches),
        rows.Sum(r => r.InternalLinkClicks));
}
