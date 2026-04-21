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
                .ToListAsync(cancellationToken);

        public Task<int> CountAsync(CancellationToken cancellationToken = default)
            => _dbSet.CountAsync(cancellationToken);

        public Task DeleteAllAsync(CancellationToken cancellationToken = default)
            => _dbSet.ExecuteDeleteAsync(cancellationToken);
    }
}
