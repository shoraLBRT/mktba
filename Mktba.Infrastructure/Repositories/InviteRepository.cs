using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.Repositories;

public class InviteRepository : GenericRepository<Invite>
{
    public InviteRepository(MktbaDbContext context) : base(context)
    {
    }

    /// <summary>The invite whose token hashes to <paramref name="tokenHash"/>, tracked, whatever its status; or null.</summary>
    public Task<Invite?> GetByHashAsync(string tokenHash, CancellationToken cancellationToken = default)
        => _dbSet.FirstOrDefaultAsync(invite => invite.TokenHash == tokenHash, cancellationToken);

    /// <summary>Every invite, newest first, read-only, with the users who created and used it.</summary>
    public Task<List<Invite>> ListNewestFirstAsync(CancellationToken cancellationToken = default)
        => _dbSet.AsNoTracking()
            .Include(invite => invite.CreatedByUser)
            .Include(invite => invite.UsedByUser)
            .OrderByDescending(invite => invite.CreatedAtUtc)
            .ThenByDescending(invite => invite.Id)
            .ToListAsync(cancellationToken);
}
