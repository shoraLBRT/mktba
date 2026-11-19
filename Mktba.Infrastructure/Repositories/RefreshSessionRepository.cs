using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.Repositories;

public class RefreshSessionRepository : GenericRepository<RefreshSession>
{
    public RefreshSessionRepository(MktbaDbContext context) : base(context)
    {
    }

    /// <summary>The token with <paramref name="tokenHash"/>, tracked, whatever its state, or null.</summary>
    public Task<RefreshSession?> GetByHashAsync(string tokenHash, CancellationToken cancellationToken = default)
        => _dbSet.FirstOrDefaultAsync(session => session.TokenHash == tokenHash, cancellationToken);

    /// <summary>The not yet revoked tokens of one device session of one user, tracked.</summary>
    public Task<List<RefreshSession>> ListUnrevokedInFamilyAsync(
        int userId,
        Guid familyId,
        CancellationToken cancellationToken = default)
        => _dbSet
            .Where(session => session.UserId == userId && session.FamilyId == familyId && session.RevokedAtUtc == null)
            .ToListAsync(cancellationToken);

    /// <summary>Every not yet revoked token of the user, tracked.</summary>
    public Task<List<RefreshSession>> ListUnrevokedOfUserAsync(int userId, CancellationToken cancellationToken = default)
        => _dbSet
            .Where(session => session.UserId == userId && session.RevokedAtUtc == null)
            .ToListAsync(cancellationToken);

    /// <summary>The user's live tokens (one per signed-in device), most recently issued first, read-only.</summary>
    public Task<List<RefreshSession>> ListActiveOfUserAsync(int userId, DateTime nowUtc, CancellationToken cancellationToken = default)
        => _dbSet.AsNoTracking()
            .Where(session => session.UserId == userId && session.RevokedAtUtc == null && session.ExpiresAtUtc > nowUtc)
            .OrderByDescending(session => session.CreatedAtUtc)
            .ToListAsync(cancellationToken);

    /// <summary>When each of the user's device sessions began: the creation time of its first token.</summary>
    public Task<Dictionary<Guid, DateTime>> GetFamilyStartsAsync(
        int userId,
        IReadOnlyCollection<Guid> familyIds,
        CancellationToken cancellationToken = default)
        => _dbSet.AsNoTracking()
            .Where(session => session.UserId == userId && familyIds.Contains(session.FamilyId))
            .GroupBy(session => session.FamilyId)
            .Select(family => new { family.Key, Start = family.Min(session => session.CreatedAtUtc) })
            .ToDictionaryAsync(family => family.Key, family => family.Start, cancellationToken);

    /// <summary>Marks the user's tokens that expired before <paramref name="nowUtc"/> for deletion; they can no longer be used or reused.</summary>
    public async Task RemoveExpiredOfUserAsync(int userId, DateTime nowUtc, CancellationToken cancellationToken = default)
    {
        var expired = await _dbSet
            .Where(session => session.UserId == userId && session.ExpiresAtUtc <= nowUtc)
            .ToListAsync(cancellationToken);
        _dbSet.RemoveRange(expired);
    }
}
