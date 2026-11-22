using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.Repositories;

/// <summary>The filters and page of an audit log read (U-09, #135); bounds are applied by the caller.</summary>
public sealed record AuditLogQuery(AuditAction? Action, int? ActorId, int? ArticleId, int? TargetUserId, int Page, int PageSize);

/// <summary>The few fields of a user an audit log entry shows.</summary>
public sealed record AuditLogUserRow(int Id, string Email, string? DisplayName);

/// <summary>The audit log (U-09, #135): entries are added to the action's own save and never changed.</summary>
public class AuditLogRepository : GenericRepository<AuditLogEntry>
{
    public AuditLogRepository(MktbaDbContext context) : base(context)
    {
    }

    /// <summary>
    /// Adds <paramref name="entry"/> to the context without saving: the caller's own SaveChanges stores
    /// it together with the action, in one transaction.
    /// </summary>
    public void Add(AuditLogEntry entry) => _dbSet.Add(entry);

    /// <summary>One page of the entries matching <paramref name="query"/>, newest first, and their total.</summary>
    public async Task<(List<AuditLogEntry> Items, int Total)> GetPageAsync(AuditLogQuery query, CancellationToken cancellationToken = default)
    {
        var entries = _dbSet.AsNoTracking();
        if (query.Action is { } action)
        {
            entries = entries.Where(entry => entry.Action == action);
        }

        if (query.ActorId is { } actorId)
        {
            entries = entries.Where(entry => entry.ActorId == actorId);
        }

        if (query.ArticleId is { } articleId)
        {
            entries = entries.Where(entry => entry.ArticleId == articleId);
        }

        if (query.TargetUserId is { } targetUserId)
        {
            entries = entries.Where(entry => entry.TargetUserId == targetUserId);
        }

        var total = await entries.CountAsync(cancellationToken);
        var items = await entries
            .OrderByDescending(entry => entry.OccurredAt)
            .ThenByDescending(entry => entry.Id)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);
        return (items, total);
    }

    /// <summary>The users among <paramref name="ids"/> that still exist, by id.</summary>
    public Task<Dictionary<int, AuditLogUserRow>> GetUsersAsync(IReadOnlyCollection<int> ids, CancellationToken cancellationToken = default)
        => _context.Users.AsNoTracking()
            .Where(user => ids.Contains(user.Id))
            .Select(user => new AuditLogUserRow(user.Id, user.Email, user.DisplayName))
            .ToDictionaryAsync(user => user.Id, cancellationToken);

    /// <summary>The articles among <paramref name="ids"/> that exist outside the trash.</summary>
    public async Task<HashSet<int>> GetLiveArticleIdsAsync(IReadOnlyCollection<int> ids, CancellationToken cancellationToken = default)
        => (await _context.Articles.AsNoTracking()
            .Where(article => ids.Contains(article.Id))
            .Select(article => article.Id)
            .ToListAsync(cancellationToken))
            .ToHashSet();
}
