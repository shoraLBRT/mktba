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
        /// Projects every article to <see cref="ArticleNavigationRow"/> in a single query, ordered by
        /// parent, then by <see cref="Article.Order"/> among siblings, then by id.
        /// Content presence is computed in SQL (EXISTS over paragraphs and infobox fields), so no
        /// child rows are loaded. With <paramref name="publishedOnly"/> the query returns only
        /// <see cref="ArticleStatus.Published"/> articles.
        /// </summary>
        public Task<List<ArticleNavigationRow>> GetNavigationRowsAsync(bool publishedOnly, CancellationToken cancellationToken = default)
            => _dbSet
                .AsNoTracking()
                .Where(article => !publishedOnly || article.Status == ArticleStatus.Published)
                .OrderBy(article => article.ParentArticleId)
                .ThenBy(article => article.Order)
                .ThenBy(article => article.Id)
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

        /// <summary>
        /// The article with its content read fresh from the database, untracked — what a revision
        /// snapshot is built from right after a save.
        /// </summary>
        public Task<Article?> GetByIdWithContentUntrackedAsync(int articleId, CancellationToken cancellationToken = default)
            => _dbSet
                .AsNoTracking()
                .Include(article => article.Paragraphs)
                    .ThenInclude(p => p.Opinions)
                        .ThenInclude(o => o.OpinionSchools)
                .Include(article => article.InfoboxFields)
                .Include(article => article.RelatedLinks)
                    .ThenInclude(link => link.RelatedArticle)
                .AsSplitQuery()
                .FirstOrDefaultAsync(article => article.Id == articleId, cancellationToken);

        /// <summary>The id of the article in <paramref name="locale"/> whose current slug is <paramref name="slug"/>, if any.</summary>
        public Task<int?> FindIdBySlugAsync(string locale, string slug, CancellationToken cancellationToken = default)
            => _dbSet
                .AsNoTracking()
                .Where(article => article.Locale == locale && article.Slug == slug)
                .Select(article => (int?)article.Id)
                .FirstOrDefaultAsync(cancellationToken);

        /// <summary>The current slug of the article in <paramref name="locale"/> that used to have <paramref name="oldSlug"/>, if any.</summary>
        public Task<string?> FindRedirectTargetSlugAsync(string locale, string oldSlug, bool publishedOnly, CancellationToken cancellationToken = default)
            => _context.ArticleSlugRedirects
                .AsNoTracking()
                .Where(redirect => redirect.Locale == locale && redirect.Slug == oldSlug)
                .Where(redirect => !publishedOnly || redirect.Article.Status == ArticleStatus.Published)
                .Select(redirect => redirect.Article.Slug)
                .FirstOrDefaultAsync(cancellationToken);

        /// <summary>
        /// Whether <paramref name="slug"/> belongs to another article in <paramref name="locale"/>, as its
        /// current slug or as one of its redirects. Articles in other locales may use the same slug.
        /// The article <paramref name="exceptArticleId"/> may reuse its own old slugs.
        /// </summary>
        public async Task<bool> IsSlugTakenAsync(string locale, string slug, int? exceptArticleId, CancellationToken cancellationToken = default)
            => await _dbSet.AnyAsync(
                   article => article.Locale == locale && article.Slug == slug && article.Id != exceptArticleId, cancellationToken)
               || await _context.ArticleSlugRedirects.AnyAsync(
                   redirect => redirect.Locale == locale && redirect.Slug == slug && redirect.ArticleId != exceptArticleId, cancellationToken);

        /// <summary>The redirects of one article, tracked so they can be changed.</summary>
        public Task<List<ArticleSlugRedirect>> GetSlugRedirectsAsync(int articleId, CancellationToken cancellationToken = default)
            => _context.ArticleSlugRedirects
                .Where(redirect => redirect.ArticleId == articleId)
                .ToListAsync(cancellationToken);

        public void AddSlugRedirect(ArticleSlugRedirect redirect) => _context.ArticleSlugRedirects.Add(redirect);

        public void RemoveSlugRedirect(ArticleSlugRedirect redirect) => _context.ArticleSlugRedirects.Remove(redirect);

        /// <summary>The article with its co-author rows, tracked so they can be changed.</summary>
        public Task<Article?> GetByIdWithCoAuthorsAsync(int articleId, CancellationToken cancellationToken = default)
            => _dbSet
                .Include(article => article.CoAuthors)
                .FirstOrDefaultAsync(article => article.Id == articleId, cancellationToken);

        /// <summary>Every article's parent id, keyed by article id — the whole hierarchy in one query.</summary>
        public Task<Dictionary<int, int?>> GetParentIdsAsync(CancellationToken cancellationToken = default)
            => _dbSet
                .AsNoTracking()
                .ToDictionaryAsync(article => article.Id, article => article.ParentArticleId, cancellationToken);

        /// <summary>The children of <paramref name="parentId"/> (roots for null), tracked, in tree order.</summary>
        public Task<List<Article>> GetSiblingsAsync(int? parentId, CancellationToken cancellationToken = default)
            => _dbSet
                .Where(article => article.ParentArticleId == parentId)
                .OrderBy(article => article.Order)
                .ThenBy(article => article.Id)
                .ToListAsync(cancellationToken);

        /// <summary>The <see cref="Article.Order"/> that places a new child of <paramref name="parentId"/> last.</summary>
        public async Task<int> GetNextSiblingOrderAsync(int? parentId, CancellationToken cancellationToken = default)
            => (await _dbSet
                .Where(article => article.ParentArticleId == parentId)
                .MaxAsync(article => (int?)article.Order, cancellationToken) ?? -1) + 1;

        public Task<int> CountAsync(CancellationToken cancellationToken = default)
            => _dbSet.CountAsync(cancellationToken);

        public Task NullifyAllParentIdsAsync(CancellationToken cancellationToken = default)
            => _dbSet.ExecuteUpdateAsync(
                s => s.SetProperty(a => a.ParentArticleId, (int?)null),
                cancellationToken);

        public Task DeleteAllAsync(CancellationToken cancellationToken = default)
            => _dbSet.ExecuteDeleteAsync(cancellationToken);

        /// <summary>Stages a new revision; revisions are never updated or removed through this repository.</summary>
        public Task AddRevisionAsync(ArticleRevision revision, CancellationToken cancellationToken = default)
            => _context.ArticleRevisions.AddAsync(revision, cancellationToken).AsTask();

        /// <summary>The highest revision number of the article, 0 if it has none yet.</summary>
        public async Task<int> GetLatestRevisionNumberAsync(int articleId, CancellationToken cancellationToken = default)
            => await _context.ArticleRevisions
                .Where(r => r.ArticleId == articleId)
                .MaxAsync(r => (int?)r.Number, cancellationToken) ?? 0;

        /// <summary>The id of the article's latest revision, null if it has none.</summary>
        public Task<int?> GetLatestRevisionIdAsync(int articleId, CancellationToken cancellationToken = default)
            => _context.ArticleRevisions
                .Where(r => r.ArticleId == articleId)
                .OrderByDescending(r => r.Number)
                .Select(r => (int?)r.Id)
                .FirstOrDefaultAsync(cancellationToken);

        /// <summary>The article's revisions, newest first, with their authors.</summary>
        public Task<List<ArticleRevision>> GetRevisionsAsync(int articleId, CancellationToken cancellationToken = default)
            => _context.ArticleRevisions
                .AsNoTracking()
                .Include(r => r.Author)
                .Where(r => r.ArticleId == articleId)
                .OrderByDescending(r => r.Number)
                .ToListAsync(cancellationToken);

        public Task<ArticleRevision?> GetRevisionAsync(int articleId, int number, CancellationToken cancellationToken = default)
            => _context.ArticleRevisions
                .AsNoTracking()
                .Include(r => r.Author)
                .FirstOrDefaultAsync(r => r.ArticleId == articleId && r.Number == number, cancellationToken);
    }
}
