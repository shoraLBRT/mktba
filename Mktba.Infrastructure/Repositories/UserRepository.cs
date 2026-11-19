using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.Repositories;

public class UserRepository : GenericRepository<User>
{
    public UserRepository(MktbaDbContext context) : base(context)
    {
    }

    public Task<bool> AnyAsync(CancellationToken cancellationToken = default)
        => _dbSet.AnyAsync(cancellationToken);

    public Task<bool> ExistsByEmailAsync(string email, CancellationToken cancellationToken = default)
        => _dbSet.AnyAsync(user => user.Email == email, cancellationToken);

    public Task<User?> GetByEmailAsync(string email, CancellationToken cancellationToken = default)
        => _dbSet.FirstOrDefaultAsync(user => user.Email == email, cancellationToken);

    /// <summary>The user with <paramref name="id"/>, read-only, or null.</summary>
    public Task<User?> FindReadOnlyAsync(int id, CancellationToken cancellationToken = default)
        => _dbSet.AsNoTracking().FirstOrDefaultAsync(user => user.Id == id, cancellationToken);

    /// <summary>
    /// The current role of the user with <paramref name="id"/> while their device session
    /// <paramref name="sessionFamilyId"/> still has a live refresh token; null when there is no such
    /// user or the session has ended (signed out, revoked or expired).
    /// </summary>
    public Task<UserRole?> GetRoleInActiveSessionAsync(
        int id,
        Guid sessionFamilyId,
        DateTime nowUtc,
        CancellationToken cancellationToken = default)
        => _dbSet
            .Where(user => user.Id == id && _context.RefreshSessions.Any(session =>
                session.UserId == id
                && session.FamilyId == sessionFamilyId
                && session.RevokedAtUtc == null
                && session.ExpiresAtUtc > nowUtc))
            .Select(user => (UserRole?)user.Role)
            .FirstOrDefaultAsync(cancellationToken);

    /// <summary>How many users have <paramref name="role"/>.</summary>
    public Task<int> CountByRoleAsync(UserRole role, CancellationToken cancellationToken = default)
        => _dbSet.CountAsync(user => user.Role == role, cancellationToken);

    /// <summary>All users ordered by email, read-only.</summary>
    public Task<List<User>> ListOrderedByEmailAsync(CancellationToken cancellationToken = default)
        => _dbSet.AsNoTracking().OrderBy(user => user.Email).ToListAsync(cancellationToken);

    /// <summary>Which of <paramref name="ids"/> belong to existing users.</summary>
    public Task<List<int>> FindExistingIdsAsync(IReadOnlyCollection<int> ids, CancellationToken cancellationToken = default)
        => _dbSet.Where(user => ids.Contains(user.Id)).Select(user => user.Id).ToListAsync(cancellationToken);
}
