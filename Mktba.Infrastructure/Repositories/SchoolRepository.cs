using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.Repositories;

public class SchoolRepository : GenericRepository<School>
{
    public SchoolRepository(MktbaDbContext context) : base(context) { }

    /// <summary>The canonical schools with their translation into <paramref name="locale"/> (none for Russian).</summary>
    public Task<List<School>> GetSystemSchoolsAsync(string locale, CancellationToken cancellationToken = default)
        => _dbSet
            .AsNoTracking()
            .Include(s => s.Translations.Where(t => t.Locale == locale))
            .Where(s => s.IsSystem)
            .OrderBy(s => s.Id)
            .ToListAsync(cancellationToken);

    public Task<List<School>> GetByArticleIdAsync(int articleId, CancellationToken cancellationToken = default)
        => _dbSet
            .Where(s => s.ArticleScopeId == articleId)
            .OrderBy(s => s.Id)
            .ToListAsync(cancellationToken);

    public Task<bool> SlugExistsAsync(string slug, CancellationToken cancellationToken = default)
        => _dbSet.AnyAsync(s => s.Slug == slug, cancellationToken);
}
