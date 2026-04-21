using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.Repositories;

public class AiProviderSettingsRepository : GenericRepository<AiProviderSettings>
{
    public AiProviderSettingsRepository(MktbaDbContext context) : base(context)
    {
    }

    public Task<AiProviderSettings?> GetSettingsAsync(CancellationToken cancellationToken = default)
        => _dbSet.FirstOrDefaultAsync(cancellationToken);
}
