using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services.Analytics;

/// <summary>
/// The content analytics of the admin dashboard (N-07, #101): Published articles nobody opened,
/// stubs readers reach before they have any text, blocks of opinions with no opinion for some of
/// the canonical mazhabs, and articles not saved for a long time — what to write, finish or refresh
/// next. Views come from the daily summaries (N-04, #98), never from raw events; the articles,
/// their blocks and their dates are read as they are now. Every language; Published articles only,
/// the ones readers can open (their place in the tree is not checked: an article under a hidden
/// parent opens by its address too).
/// </summary>
public class ContentAnalyticsService
{
    public const int DefaultDays = SiteAnalyticsService.DefaultDays;
    public const int MaxDays = SiteAnalyticsService.MaxDays;
    public const int ListLimit = 50;

    private readonly AnalyticsSummaryRepository _summaries;
    private readonly ArticleRepository _articles;
    private readonly TimeProvider _clock;
    private readonly AnalyticsOptions _options;

    public ContentAnalyticsService(
        AnalyticsSummaryRepository summaries,
        ArticleRepository articles,
        TimeProvider clock,
        IOptions<AnalyticsOptions> options)
    {
        _summaries = summaries;
        _articles = articles;
        _clock = clock;
        _options = options.Value;
    }

    /// <summary>The last <paramref name="days"/> UTC days (kept within 1 to <see cref="MaxDays"/>), today included.</summary>
    public async Task<ContentAnalyticsDto> GetAsync(int days, CancellationToken cancellationToken = default)
    {
        var count = Math.Clamp(days, 1, MaxDays);
        var now = _clock.GetUtcNow().UtcDateTime;
        var to = DateOnly.FromDateTime(now);
        var from = to.AddDays(-(count - 1));
        var periodStart = from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var staleAfterDays = _options.StaleAfterDays;
        var staleBefore = now.AddDays(-staleAfterDays);

        var built = await _summaries.GetSiteDaysAsync(from, to, cancellationToken);
        var views = await _summaries.GetArticleViewsAsync(from, to, cancellationToken);
        var rows = await _articles.GetRecentRowsAsync(cancellationToken);
        var articles = rows.Select(row =>
            {
                var total = views.GetValueOrDefault(row.Id);
                return (Row: row, Dto: new ContentArticleDto(
                    row.Id, row.Title, row.Slug, row.PublishedAt, row.UpdatedAt, total?.Views ?? 0, total?.Readers ?? 0));
            })
            .ToList();

        var withoutViews = articles
            .Where(a => a.Row.HasContent && a.Row.PublishedAt < periodStart && a.Dto.Views == 0)
            .Select(a => a.Dto)
            .OrderBy(a => a.PublishedAt).ThenBy(a => a.ArticleId);
        var stubsWithTraffic = articles
            .Where(a => !a.Row.HasContent && a.Dto.Views > 0)
            .Select(a => a.Dto)
            .OrderByDescending(a => a.Views).ThenBy(a => a.ArticleId);
        var stale = articles
            .Where(a => a.Row.HasContent && a.Row.UpdatedAt < staleBefore)
            .Select(a => a.Dto)
            .OrderByDescending(a => a.Views).ThenBy(a => a.UpdatedAt).ThenBy(a => a.ArticleId);

        var blocks = await GetUncoveredBlocksAsync(from, to, articles.ToDictionary(a => a.Row.Id, a => a.Dto), cancellationToken);

        return new ContentAnalyticsDto(
            count,
            from,
            to,
            ToList(withoutViews.ToList()),
            ToList(stubsWithTraffic.ToList()),
            new UncoveredOpinionBlockListDto(blocks.Count, blocks.Take(ListLimit).ToList()),
            ToList(stale.ToList()),
            staleAfterDays,
            built.Count == 0 ? null : built.Max(d => d.AggregatedAtUtc));
    }

    private async Task<List<UncoveredOpinionBlockDto>> GetUncoveredBlocksAsync(
        DateOnly from, DateOnly to, IReadOnlyDictionary<int, ContentArticleDto> articles, CancellationToken cancellationToken)
    {
        var systemSchools = await _summaries.GetSystemSchoolNamesAsync(cancellationToken);
        if (systemSchools.Count == 0)
        {
            return [];
        }

        var schoolViews = (await _summaries.GetArticleSchoolViewsAsync(from, to, cancellationToken))
            .ToDictionary(v => (v.ArticleId, v.SchoolId), v => v.Views);
        var blocks = await _summaries.GetPublishedOpinionBlocksAsync(cancellationToken);

        return blocks
            .Where(block => articles.ContainsKey(block.ArticleId))
            .Select(block => (Block: block, Missing: systemSchools.Keys.Except(block.SchoolIds).Order().ToList()))
            .Where(x => x.Missing.Count > 0)
            .Select(x =>
            {
                var article = articles[x.Block.ArticleId];
                return new UncoveredOpinionBlockDto(
                    article.ArticleId,
                    article.Title,
                    article.Slug,
                    x.Block.ParagraphId,
                    x.Block.Position,
                    x.Block.Opinions,
                    x.Missing.Select(id => systemSchools[id]).ToList(),
                    x.Missing.Sum(id => schoolViews.GetValueOrDefault((article.ArticleId, id))),
                    article.Views);
            })
            .OrderByDescending(b => b.MissingSchoolViews)
            .ThenByDescending(b => b.ArticleViews)
            .ThenBy(b => b.ArticleId)
            .ThenBy(b => b.Position)
            .ToList();
    }

    private static ContentArticleListDto ToList(IReadOnlyList<ContentArticleDto> matching)
        => new(matching.Count, matching.Take(ListLimit).ToList());
}
