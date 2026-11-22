using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.Repositories;

/// <summary>What a daily summary needs of one raw event (N-04, #98).</summary>
public sealed record AnalyticsEventFacts(
    AnalyticsEventType Type,
    int? ArticleId,
    int? SchoolId,
    short? ScrollDepth,
    Guid? VisitorId,
    string? Query);

/// <summary>Who an article is by and what it is tagged with, as it is now.</summary>
public sealed record ArticleAttribution(int ArticleId, IReadOnlyList<int> AuthorIds, IReadOnlyList<int> TagIds);

/// <summary>Every summary row of one UTC day.</summary>
public sealed record AnalyticsDaySummaries(
    AnalyticsDay Site,
    IReadOnlyList<AnalyticsArticleDay> Articles,
    IReadOnlyList<AnalyticsArticleSchoolDay> ArticleSchools,
    IReadOnlyList<AnalyticsAuthorDay> Authors,
    IReadOnlyList<AnalyticsTagDay> Tags,
    IReadOnlyList<AnalyticsSearchDay> Searches);

/// <summary>The views and readers of one article (or one mazhab) added up over a period of days.</summary>
/// <param name="Readers">Reader-days: visitor ids change every UTC day, so the days' readers are added up.</param>
public sealed record AnalyticsViewsTotal(int Id, int Views, int Readers);

/// <summary>
/// One article's views, readers and read depth added up over a period of days (P-03, #91): how many
/// of the views got to a quarter, half, three quarters and the end of the text.
/// </summary>
/// <param name="Readers">Reader-days, as <see cref="AnalyticsViewsTotal.Readers"/>.</param>
public sealed record AnalyticsArticleReading(
    int Id, int Views, int Readers, int ReachedDepth25, int ReachedDepth50, int ReachedDepth75, int ReachedDepth100);

/// <summary>Reads raw analytics events by day, stores their daily summaries (N-04, #98) and reads them back for the dashboards.</summary>
public class AnalyticsSummaryRepository
{
    private readonly MktbaDbContext _context;

    public AnalyticsSummaryRepository(MktbaDbContext context)
    {
        _context = context;
    }

    /// <summary>The latest day aggregated for good, if any.</summary>
    public Task<DateOnly?> GetLastFinalDayAsync(CancellationToken cancellationToken = default)
        => _context.AnalyticsDays.AsNoTracking()
            .Where(d => d.IsFinal)
            .MaxAsync(d => (DateOnly?)d.Day, cancellationToken);

    /// <summary>When the oldest stored event happened, if any.</summary>
    public Task<DateTime?> GetFirstEventTimeAsync(CancellationToken cancellationToken = default)
        => _context.AnalyticsEvents.AsNoTracking()
            .MinAsync(e => (DateTime?)e.OccurredAtUtc, cancellationToken);

    /// <summary>The events in [<paramref name="fromUtc"/>, <paramref name="toUtc"/>), read one by one.</summary>
    public IAsyncEnumerable<AnalyticsEventFacts> StreamEventsAsync(DateTime fromUtc, DateTime toUtc)
        => _context.AnalyticsEvents.AsNoTracking()
            .Where(e => e.OccurredAtUtc >= fromUtc && e.OccurredAtUtc < toUtc)
            .Select(e => new AnalyticsEventFacts(e.Type, e.ArticleId, e.SchoolId, e.ScrollDepth, e.VisitorId, e.Query))
            .AsAsyncEnumerable();

    /// <summary>The authors (the author and the co-authors) and the tags of each of <paramref name="articleIds"/> that still exists.</summary>
    public async Task<List<ArticleAttribution>> GetAttributionsAsync(IReadOnlyCollection<int> articleIds, CancellationToken cancellationToken = default)
    {
        if (articleIds.Count == 0)
        {
            return [];
        }

        var authors = await _context.Articles.AsNoTracking()
            .Where(a => articleIds.Contains(a.Id) && a.AuthorId != null)
            .Select(a => new { ArticleId = a.Id, UserId = a.AuthorId!.Value })
            .ToListAsync(cancellationToken);
        var coAuthors = await _context.ArticleCoAuthors.AsNoTracking()
            .Where(c => articleIds.Contains(c.ArticleId))
            .Select(c => new { c.ArticleId, c.UserId })
            .ToListAsync(cancellationToken);
        var tags = await _context.ArticleTags.AsNoTracking()
            .Where(t => articleIds.Contains(t.ArticleId))
            .Select(t => new { t.ArticleId, t.TagId })
            .ToListAsync(cancellationToken);

        var authorsByArticle = authors.Concat(coAuthors).ToLookup(a => a.ArticleId, a => a.UserId);
        var tagsByArticle = tags.ToLookup(t => t.ArticleId, t => t.TagId);
        return articleIds
            .Select(id => new ArticleAttribution(id, authorsByArticle[id].Distinct().ToList(), tagsByArticle[id].Distinct().ToList()))
            .ToList();
    }

    /// <summary>Replaces every summary row of the day with <paramref name="summaries"/>, in one transaction.</summary>
    public async Task ReplaceDayAsync(AnalyticsDaySummaries summaries, CancellationToken cancellationToken = default)
    {
        var day = summaries.Site.Day;
        var relational = _context.Database.IsRelational();
        await using var transaction = relational ? await _context.Database.BeginTransactionAsync(cancellationToken) : null;

        await DeleteAsync(_context.AnalyticsDays.Where(d => d.Day == day), cancellationToken);
        await DeleteAsync(_context.AnalyticsArticleDays.Where(d => d.Day == day), cancellationToken);
        await DeleteAsync(_context.AnalyticsArticleSchoolDays.Where(d => d.Day == day), cancellationToken);
        await DeleteAsync(_context.AnalyticsAuthorDays.Where(d => d.Day == day), cancellationToken);
        await DeleteAsync(_context.AnalyticsTagDays.Where(d => d.Day == day), cancellationToken);
        await DeleteAsync(_context.AnalyticsSearchDays.Where(d => d.Day == day), cancellationToken);

        _context.AnalyticsDays.Add(summaries.Site);
        _context.AnalyticsArticleDays.AddRange(summaries.Articles);
        _context.AnalyticsArticleSchoolDays.AddRange(summaries.ArticleSchools);
        _context.AnalyticsAuthorDays.AddRange(summaries.Authors);
        _context.AnalyticsTagDays.AddRange(summaries.Tags);
        _context.AnalyticsSearchDays.AddRange(summaries.Searches);
        await _context.SaveChangesAsync(cancellationToken);
        _context.ChangeTracker.Clear();

        if (transaction is not null)
        {
            await transaction.CommitAsync(cancellationToken);
        }
    }

    /// <summary>The site's summary of each built day in [<paramref name="from"/>, <paramref name="to"/>], oldest first.</summary>
    public Task<List<AnalyticsDay>> GetSiteDaysAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
        => _context.AnalyticsDays.AsNoTracking()
            .Where(d => d.Day >= from && d.Day <= to)
            .OrderBy(d => d.Day)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// The <paramref name="limit"/> most viewed articles over [<paramref name="from"/>, <paramref name="to"/>],
    /// most views first (then the lower id), whether or not the article still exists.
    /// </summary>
    public async Task<List<AnalyticsViewsTotal>> GetTopArticlesAsync(DateOnly from, DateOnly to, int limit, CancellationToken cancellationToken = default)
    {
        var totals = await _context.AnalyticsArticleDays.AsNoTracking()
            .Where(d => d.Day >= from && d.Day <= to)
            .GroupBy(d => d.ArticleId)
            .Select(g => new { Id = g.Key, Views = g.Sum(d => d.Views), Readers = g.Sum(d => d.Readers) })
            .OrderByDescending(t => t.Views).ThenBy(t => t.Id)
            .Take(limit)
            .ToListAsync(cancellationToken);
        return totals.Select(t => new AnalyticsViewsTotal(t.Id, t.Views, t.Readers)).ToList();
    }

    /// <summary>The article views over [<paramref name="from"/>, <paramref name="to"/>] by the mazhab the reader had chosen, most views first.</summary>
    public async Task<List<AnalyticsViewsTotal>> GetSchoolViewsAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        var totals = await _context.AnalyticsArticleSchoolDays.AsNoTracking()
            .Where(d => d.Day >= from && d.Day <= to)
            .GroupBy(d => d.SchoolId)
            .Select(g => new { Id = g.Key, Views = g.Sum(d => d.Views), Readers = g.Sum(d => d.Readers) })
            .OrderByDescending(t => t.Views).ThenBy(t => t.Id)
            .ToListAsync(cancellationToken);
        return totals.Select(t => new AnalyticsViewsTotal(t.Id, t.Views, t.Readers)).ToList();
    }

    /// <summary>
    /// The views of <paramref name="articleIds"/> over [<paramref name="from"/>, <paramref name="to"/>] by the mazhab the reader had
    /// chosen, most views first (P-03, #91).
    /// </summary>
    public async Task<List<AnalyticsViewsTotal>> GetSchoolViewsOfArticlesAsync(
        DateOnly from, DateOnly to, IReadOnlyCollection<int> articleIds, CancellationToken cancellationToken = default)
    {
        if (articleIds.Count == 0)
        {
            return [];
        }

        var totals = await _context.AnalyticsArticleSchoolDays.AsNoTracking()
            .Where(d => d.Day >= from && d.Day <= to && articleIds.Contains(d.ArticleId))
            .GroupBy(d => d.SchoolId)
            .Select(g => new { Id = g.Key, Views = g.Sum(d => d.Views), Readers = g.Sum(d => d.Readers) })
            .OrderByDescending(t => t.Views).ThenBy(t => t.Id)
            .ToListAsync(cancellationToken);
        return totals.Select(t => new AnalyticsViewsTotal(t.Id, t.Views, t.Readers)).ToList();
    }

    /// <summary>The ids of the articles <paramref name="userId"/> writes or co-writes now (P-03, #91).</summary>
    public async Task<List<int>> GetAuthoredArticleIdsAsync(int userId, CancellationToken cancellationToken = default)
    {
        var written = await _context.Articles.AsNoTracking()
            .Where(a => a.AuthorId == userId)
            .Select(a => a.Id)
            .ToListAsync(cancellationToken);
        var coWritten = await _context.ArticleCoAuthors.AsNoTracking()
            .Where(c => c.UserId == userId)
            .Select(c => c.ArticleId)
            .ToListAsync(cancellationToken);
        return written.Concat(coWritten).Distinct().Order().ToList();
    }

    /// <summary>The summary of <paramref name="userId"/> as an author for each built day in [<paramref name="from"/>, <paramref name="to"/>], oldest first.</summary>
    public Task<List<AnalyticsAuthorDay>> GetAuthorDaysAsync(int userId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
        => _context.AnalyticsAuthorDays.AsNoTracking()
            .Where(d => d.UserId == userId && d.Day >= from && d.Day <= to)
            .OrderBy(d => d.Day)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// The views, readers and read depth of each of <paramref name="articleIds"/> viewed in [<paramref name="from"/>, <paramref name="to"/>],
    /// most views first (then the lower id) (P-03, #91).
    /// </summary>
    public async Task<List<AnalyticsArticleReading>> GetArticleReadingAsync(
        DateOnly from, DateOnly to, IReadOnlyCollection<int> articleIds, CancellationToken cancellationToken = default)
    {
        if (articleIds.Count == 0)
        {
            return [];
        }

        var totals = await _context.AnalyticsArticleDays.AsNoTracking()
            .Where(d => d.Day >= from && d.Day <= to && articleIds.Contains(d.ArticleId))
            .GroupBy(d => d.ArticleId)
            .Select(g => new
            {
                Id = g.Key,
                Views = g.Sum(d => d.Views),
                Readers = g.Sum(d => d.Readers),
                Depth25 = g.Sum(d => d.ReachedDepth25),
                Depth50 = g.Sum(d => d.ReachedDepth50),
                Depth75 = g.Sum(d => d.ReachedDepth75),
                Depth100 = g.Sum(d => d.ReachedDepth100),
            })
            .ToListAsync(cancellationToken);
        return totals
            .OrderByDescending(t => t.Views).ThenBy(t => t.Id)
            .Select(t => new AnalyticsArticleReading(t.Id, t.Views, t.Readers, t.Depth25, t.Depth50, t.Depth75, t.Depth100))
            .ToList();
    }

    /// <summary>The title and slug of each of <paramref name="articleIds"/> that still exists.</summary>
    public async Task<Dictionary<int, (string Title, string Slug)>> GetArticleNamesAsync(IReadOnlyCollection<int> articleIds, CancellationToken cancellationToken = default)
    {
        var names = await _context.Articles.AsNoTracking()
            .Where(a => articleIds.Contains(a.Id))
            .Select(a => new { a.Id, a.Title, a.Slug })
            .ToListAsync(cancellationToken);
        return names.ToDictionary(a => a.Id, a => (a.Title, a.Slug));
    }

    /// <summary>The name of each of <paramref name="schoolIds"/> that still exists.</summary>
    public Task<Dictionary<int, string>> GetSchoolNamesAsync(IReadOnlyCollection<int> schoolIds, CancellationToken cancellationToken = default)
        => _context.Schools.AsNoTracking()
            .Where(s => schoolIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, s => s.Name, cancellationToken);

    /// <summary>Removes the raw events that happened before <paramref name="beforeUtc"/>; returns how many.</summary>
    public Task<int> DeleteEventsBeforeAsync(DateTime beforeUtc, CancellationToken cancellationToken = default)
        => DeleteAsync(_context.AnalyticsEvents.Where(e => e.OccurredAtUtc < beforeUtc), cancellationToken);

    // A set-based delete on PostgreSQL; the InMemory provider of the tests has none, so rows are
    // loaded and removed there.
    private async Task<int> DeleteAsync<T>(IQueryable<T> rows, CancellationToken cancellationToken)
        where T : class
    {
        if (_context.Database.IsRelational())
        {
            return await rows.ExecuteDeleteAsync(cancellationToken);
        }

        var loaded = await rows.ToListAsync(cancellationToken);
        _context.RemoveRange(loaded);
        await _context.SaveChangesAsync(cancellationToken);
        return loaded.Count;
    }
}
