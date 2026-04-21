using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.Repositories;

public class AdminInviteTokenRepository : GenericRepository<AdminInviteToken>
{
    public AdminInviteTokenRepository(MktbaDbContext context) : base(context)
    {
    }

    public Task<AdminInviteToken?> GetActiveByHashAsync(
        string tokenHash,
        DateTime nowUtc,
        CancellationToken cancellationToken = default)
        => _dbSet.FirstOrDefaultAsync(token =>
            token.TokenHash == tokenHash
            && token.UsedAtUtc == null
            && token.ExpiresAtUtc > nowUtc,
            cancellationToken);
}
