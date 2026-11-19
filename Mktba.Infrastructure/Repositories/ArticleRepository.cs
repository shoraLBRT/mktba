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

        public Task<List<Article>> GetAllWithParagraphsAsync(bool publishedOnly, CancellationToken cancellationToken = default)
            => _dbSet
                .Where(article => !publishedOnly || article.Status == ArticleStatus.Published)
                .Include(article => article.Paragraphs)
                .Include(article => article.InfoboxFields)
                .Include(article => article.RelatedLinks)
                .ToListAsync(cancellationToken);

        /// <summary>
        /// Projects every article to <see cref="ArticleNavigationRow"/> in a single query, ordered by id.
        /// Content presence is computed in SQL (EXISTS over paragraphs and infobox fields), so no
        /// child rows are loaded. With <paramref name="publishedOnly"/> the query returns only
        /// <see cref="ArticleStatus.Published"/> articles.
        /// </summary>
        public Task<List<ArticleNavigationRow>> GetNavigationRowsAsync(bool publishedOnly, CancellationToken cancellationToken = default)
            => _dbSet
                .AsNoTracking()
                .Where(article => !publishedOnly || article.Status == ArticleStatus.Published)
                .OrderBy(article => article.Id)
                .Select(article => new ArticleNavigationRow(
                    article.Id,
                    article.Title,
                    article.Slug,
                    article.ParentArticleId,
                    article.Status,
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

        /// <summary>The id of the article whose current slug is <paramref name="slug"/>, if any.</summary>
        public Task<int?> FindIdBySlugAsync(string slug, CancellationToken cancellationToken = default)
            => _dbSet
                .AsNoTracking()
                .Where(article => article.Slug == slug)
                .Select(article => (int?)article.Id)
                .FirstOrDefaultAsync(cancellationToken);

        /// <summary>The current slug of the article that used to have <paramref name="oldSlug"/>, if any.</summary>
        public Task<string?> FindRedirectTargetSlugAsync(string oldSlug, bool publishedOnly, CancellationToken cancellationToken = default)
            => _context.ArticleSlugRedirects
                .AsNoTracking()
                .Where(redirect => redirect.Slug == oldSlug)
                .Where(redirect => !publishedOnly || redirect.Article.Status == ArticleStatus.Published)
                .Select(redirect => redirect.Article.Slug)
                .FirstOrDefaultAsync(cancellationToken);

        /// <summary>
        /// Whether <paramref name="slug"/> belongs to another article, as its current slug or as one
        /// of its redirects. The article <paramref name="exceptArticleId"/> may reuse its own old slugs.
        /// </summary>
        public async Task<bool> IsSlugTakenAsync(string slug, int? exceptArticleId, CancellationToken cancellationToken = default)
            => await _dbSet.AnyAsync(article => article.Slug == slug && article.Id != exceptArticleId, cancellationToken)
               || await _context.ArticleSlugRedirects.AnyAsync(
                   redirect => redirect.Slug == slug && redirect.ArticleId != exceptArticleId, cancellationToken);

        /// <summary>The redirects of one article, tracked so they can be changed.</summary>
        public Task<List<ArticleSlugRedirect>> GetSlugRedirectsAsync(int articleId, CancellationToken cancellationToken = default)
            => _context.ArticleSlugRedirects
                .Where(redirect => redirect.ArticleId == articleId)
                .ToListAsync(cancellationToken);

        public void AddSlugRedirect(ArticleSlugRedirect redirect) => _context.ArticleSlugRedirects.Add(redirect);

        public void RemoveSlugRedirect(ArticleSlugRedirect redirect) => _context.ArticleSlugRedirects.Remove(redirect);

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
