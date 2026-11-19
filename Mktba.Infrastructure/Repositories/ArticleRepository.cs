using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.Repositories
{
    public class ArticleRepository : GenericRepository<Article>
    {
        public ArticleRepository(MktbaDbContext context) : base(context) { }

        public Task<List<Article>> GetAllWithHierarchyAsync(CancellationToken cancellationToken = default)
            => _dbSet
                .Include(article => article.ChildArticles)
                .Include(article => article.Paragraphs)
                .Include(article => article.InfoboxFields)
                .Include(article => article.RelatedLinks)
                .ToListAsync(cancellationToken);

        public Task<List<Article>> GetAllWithParagraphsAsync(CancellationToken cancellationToken = default)
            => _dbSet
                .Include(article => article.Paragraphs)
                .Include(article => article.InfoboxFields)
                .Include(article => article.RelatedLinks)
                .ToListAsync(cancellationToken);

        /// <summary>
        /// Projects every article to <see cref="ArticleNavigationRow"/> in a single query, ordered by id.
        /// Content presence is computed in SQL (EXISTS over paragraphs and infobox fields), so no
        /// child rows are loaded.
        /// </summary>
        public Task<List<ArticleNavigationRow>> GetNavigationRowsAsync(CancellationToken cancellationToken = default)
            => _dbSet
                .AsNoTracking()
                .OrderBy(article => article.Id)
                .Select(article => new ArticleNavigationRow(
                    article.Id,
                    article.Title,
                    article.ParentArticleId,
                    article.Paragraphs.Any()
                        || article.InfoboxFields.Any()
                        || !string.IsNullOrWhiteSpace(article.InfoboxTitle)
                        || !string.IsNullOrWhiteSpace(article.InfoboxSubtitle)))
                .ToListAsync(cancellationToken);

        public Task<Article?> GetByIdWithContentAsync(int articleId, CancellationToken cancellationToken = default)
            => _dbSet
                .Include(article => article.Paragraphs)
                    .ThenInclude(p => p.Opinions)
                        .ThenInclude(o => o.OpinionSchools)
                .Include(article => article.InfoboxFields)
                .Include(article => article.RelatedLinks)
                    .ThenInclude(link => link.RelatedArticle)
                .FirstOrDefaultAsync(article => article.Id == articleId, cancellationToken);

        public Task<int> CountAsync(CancellationToken cancellationToken = default)
            => _dbSet.CountAsync(cancellationToken);

        public Task NullifyAllParentIdsAsync(CancellationToken cancellationToken = default)
            => _dbSet.ExecuteUpdateAsync(
                s => s.SetProperty(a => a.ParentArticleId, (int?)null),
                cancellationToken);

        public Task DeleteAllAsync(CancellationToken cancellationToken = default)
            => _dbSet.ExecuteDeleteAsync(cancellationToken);
    }
}
