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

    /// <summary>All users ordered by email, read-only.</summary>
    public Task<List<User>> ListOrderedByEmailAsync(CancellationToken cancellationToken = default)
        => _dbSet.AsNoTracking().OrderBy(user => user.Email).ToListAsync(cancellationToken);

    /// <summary>Which of <paramref name="ids"/> belong to existing users.</summary>
    public Task<List<int>> FindExistingIdsAsync(IReadOnlyCollection<int> ids, CancellationToken cancellationToken = default)
        => _dbSet.Where(user => ids.Contains(user.Id)).Select(user => user.Id).ToListAsync(cancellationToken);
}
