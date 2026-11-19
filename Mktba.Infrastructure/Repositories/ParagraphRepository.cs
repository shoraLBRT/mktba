using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.Repositories
{
    public class ParagraphRepository : GenericRepository<Paragraph>
    {
        public ParagraphRepository(MktbaDbContext context) : base(context) { }

        public Task<List<Paragraph>> GetParagraphsByArticleAsync(int articleId, CancellationToken cancellationToken = default)
            => _dbSet
                .Where(p => p.ArticleId == articleId)
                .Include(p => p.Opinions)
                    .ThenInclude(o => o.OpinionSchools)
                .Include(p => p.Opinions)
                    .ThenInclude(o => o.Sources)
                .ToListAsync(cancellationToken);

        /// <summary>Which of <paramref name="sourceIds"/> are in the directory of sources.</summary>
        public async Task<HashSet<int>> GetExistingSourceIdsAsync(IReadOnlyCollection<int> sourceIds, CancellationToken cancellationToken = default)
            => (await _context.Sources
                .Where(s => sourceIds.Contains(s.Id))
                .Select(s => s.Id)
                .ToListAsync(cancellationToken)).ToHashSet();

        public Task<int> CountAsync(CancellationToken cancellationToken = default)
            => _dbSet.CountAsync(cancellationToken);

        public Task DeleteAllAsync(CancellationToken cancellationToken = default)
            => _dbSet.ExecuteDeleteAsync(cancellationToken);
    }
}
