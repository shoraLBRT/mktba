using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.Repositories;

/// <summary>The paragraph and article an opinion belongs to.</summary>
public sealed record OpinionPlacementRow(int OpinionId, int ParagraphId, int ArticleId);

public class AnalyticsEventRepository
{
    private readonly MktbaDbContext _context;

    public AnalyticsEventRepository(MktbaDbContext context)
    {
        _context = context;
    }

    /// <summary>Which of <paramref name="articleIds"/> are Published articles.</summary>
    public Task<List<int>> GetPublishedArticleIdsAsync(IReadOnlyCollection<int> articleIds, CancellationToken cancellationToken = default)
        => _context.Articles.AsNoTracking()
            .Where(a => articleIds.Contains(a.Id) && a.Status == ArticleStatus.Published)
            .Select(a => a.Id)
            .ToListAsync(cancellationToken);

    /// <summary>Where each of <paramref name="opinionIds"/> that exists sits.</summary>
    public Task<List<OpinionPlacementRow>> GetOpinionPlacementsAsync(IReadOnlyCollection<int> opinionIds, CancellationToken cancellationToken = default)
        => _context.Opinions.AsNoTracking()
            .Where(o => opinionIds.Contains(o.Id))
            .Select(o => new OpinionPlacementRow(o.Id, o.ParagraphId, o.Paragraph.ArticleId))
            .ToListAsync(cancellationToken);

    /// <summary>Which of <paramref name="schoolIds"/> are schools.</summary>
    public Task<List<int>> GetExistingSchoolIdsAsync(IReadOnlyCollection<int> schoolIds, CancellationToken cancellationToken = default)
        => _context.Schools.AsNoTracking()
            .Where(s => schoolIds.Contains(s.Id))
            .Select(s => s.Id)
            .ToListAsync(cancellationToken);

    /// <summary>The stored events of <paramref name="types"/> in the page views <paramref name="viewIds"/> (N-03, #97).</summary>
    public Task<List<AnalyticsEvent>> GetViewEventsAsync(
        IReadOnlyCollection<Guid> viewIds,
        IReadOnlyCollection<AnalyticsEventType> types,
        CancellationToken cancellationToken = default)
        => _context.AnalyticsEvents.AsNoTracking()
            .Where(e => e.ViewId != null && viewIds.Contains(e.ViewId.Value) && types.Contains(e.Type))
            .ToListAsync(cancellationToken);

    /// <summary>The article views of <paramref name="visitorIds"/> stored since <paramref name="sinceUtc"/> (N-03, #97).</summary>
    public Task<List<AnalyticsEvent>> GetArticleViewsSinceAsync(
        IReadOnlyCollection<Guid> visitorIds,
        DateTime sinceUtc,
        CancellationToken cancellationToken = default)
        => _context.AnalyticsEvents.AsNoTracking()
            .Where(e => e.VisitorId != null
                && visitorIds.Contains(e.VisitorId.Value)
                && e.OccurredAtUtc >= sinceUtc
                && e.Type == AnalyticsEventType.ArticleView)
            .ToListAsync(cancellationToken);

    public async Task AddRangeAsync(IEnumerable<AnalyticsEvent> events, CancellationToken cancellationToken = default)
    {
        await _context.AnalyticsEvents.AddRangeAsync(events, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);
    }
}
