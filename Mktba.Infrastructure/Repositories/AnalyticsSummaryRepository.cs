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

/// <summary>Reads raw analytics events by day and stores their daily summaries (N-04, #98).</summary>
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
