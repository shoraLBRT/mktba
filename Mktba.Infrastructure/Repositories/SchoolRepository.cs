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

    /// <summary>
    /// The scholar opinions one article has (M-08, #116): those created for it and those its opinions
    /// are linked to, created for another article or straight into the directory. With the article
    /// about each scholar, for the link.
    /// </summary>
    public Task<List<School>> GetByArticleIdAsync(int articleId, CancellationToken cancellationToken = default)
        => _dbSet
            .AsNoTracking()
            .Include(s => s.ScholarArticle)
            .Where(s => !s.IsSystem
                && (s.ArticleScopeId == articleId
                    || s.OpinionSchools.Any(os => os.Opinion.Paragraph.ArticleId == articleId)))
            .OrderBy(s => s.Id)
            .ToListAsync(cancellationToken);

    /// <summary>The whole directory of scholar opinions (every custom school), by name.</summary>
    public Task<List<School>> GetCustomSchoolsAsync(CancellationToken cancellationToken = default)
        => _dbSet
            .AsNoTracking()
            .Include(s => s.ScholarArticle)
            .Where(s => !s.IsSystem)
            .OrderBy(s => s.Name)
            .ThenBy(s => s.Id)
            .ToListAsync(cancellationToken);

    /// <summary>One school, tracked, with the article about its scholar.</summary>
    public Task<School?> GetWithScholarArticleAsync(int id, CancellationToken cancellationToken = default)
        => _dbSet
            .Include(s => s.ScholarArticle)
            .FirstOrDefaultAsync(s => s.Id == id, cancellationToken);

    /// <summary>
    /// Whether an opinion of an article other than <paramref name="articleId"/> is linked to the school;
    /// with <paramref name="articleId"/> null, whether any opinion is.
    /// </summary>
    public Task<bool> IsUsedOutsideArticleAsync(int schoolId, int? articleId, CancellationToken cancellationToken = default)
        => _context.Set<OpinionSchool>()
            .AnyAsync(os => os.SchoolId == schoolId && os.Opinion.Paragraph.ArticleId != articleId, cancellationToken);

    public Task<bool> SlugExistsAsync(string slug, CancellationToken cancellationToken = default)
        => _dbSet.AnyAsync(s => s.Slug == slug, cancellationToken);
}
