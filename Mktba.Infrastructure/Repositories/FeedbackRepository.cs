using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.Repositories;

public class FeedbackRepository : GenericRepository<FeedbackMessage>
{
    public FeedbackRepository(MktbaDbContext context) : base(context) { }

    public Task<bool> ArticleExistsAsync(int articleId, CancellationToken cancellationToken = default)
        => _context.Articles.AnyAsync(a => a.Id == articleId, cancellationToken);

    public Task<bool> SystemSchoolExistsAsync(string slug, CancellationToken cancellationToken = default)
        => _context.Schools.AnyAsync(s => s.IsSystem && s.Slug == slug, cancellationToken);

    /// <summary>Ids of the pending messages whose next attempt is due, the longest-waiting first.</summary>
    public Task<List<int>> GetDueIdsAsync(DateTime nowUtc, int limit, CancellationToken cancellationToken = default)
        => _dbSet.AsNoTracking()
            .Where(f => f.DeliveryState == FeedbackDeliveryState.Pending && f.NextAttemptAtUtc <= nowUtc)
            .OrderBy(f => f.NextAttemptAtUtc)
            .ThenBy(f => f.Id)
            .Select(f => f.Id)
            .Take(limit)
            .ToListAsync(cancellationToken);

    /// <summary>The message, tracked, with its article.</summary>
    public Task<FeedbackMessage?> GetForDeliveryAsync(int id, CancellationToken cancellationToken = default)
        => _dbSet.Include(f => f.Article).FirstOrDefaultAsync(f => f.Id == id, cancellationToken);

    /// <summary>Russian name of the canonical school with this slug, or null.</summary>
    public Task<string?> FindSystemSchoolNameAsync(string slug, CancellationToken cancellationToken = default)
        => _context.Schools.AsNoTracking()
            .Where(s => s.IsSystem && s.Slug == slug)
            .Select(s => s.Name)
            .FirstOrDefaultAsync(cancellationToken);

    public Task SaveChangesAsync(CancellationToken cancellationToken)
        => _context.SaveChangesAsync(cancellationToken);

    /// <summary>Forgets every tracked entity, so a failed save does not ride along with the next one.</summary>
    public void ClearTracking() => _context.ChangeTracker.Clear();
}
