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

        /// <summary>The articles <paramref name="viewer"/> may read, with their content rows and co-authors.</summary>
        public Task<List<Article>> GetAllWithParagraphsAsync(ArticleViewer viewer, CancellationToken cancellationToken = default)
            => _dbSet
                .VisibleTo(viewer)
                .Include(article => article.CoAuthors)
                .Include(article => article.Paragraphs)
                .Include(article => article.InfoboxFields)
                .Include(article => article.RelatedLinks)
                .ToListAsync(cancellationToken);

        /// <summary>
        /// Projects every article to <see cref="ArticleNavigationRow"/> in a single query, ordered by
        /// parent, then by <see cref="Article.Order"/> among siblings, then by id.
        /// Content presence is computed in SQL (EXISTS over paragraphs and infobox fields), so no
        /// child rows are loaded. Only the articles <paramref name="viewer"/> may read are returned,
        /// each marked with whether the viewer may edit it (<see cref="ArticleViewer.CanEdit(Article)"/>).
        /// </summary>
        public Task<List<ArticleNavigationRow>> GetNavigationRowsAsync(ArticleViewer viewer, CancellationToken cancellationToken = default)
        {
            var editsAny = viewer.EditsAnyArticle;
            var userId = viewer.UserId;
            return _dbSet
                .AsNoTracking()
                .VisibleTo(viewer)
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
                        || !string.IsNullOrWhiteSpace(article.InfoboxSubtitle),
                    editsAny
                        || (userId != null && article.AuthorId == userId)
                        || (userId != null && article.CoAuthors.Any(coAuthor => coAuthor.UserId == userId))))
                .ToListAsync(cancellationToken);
        }

        /// <summary>
        /// Every article an anonymous reader may see (Published), projected to
        /// <see cref="ArticleSitemapRow"/> in a single query with no content rows.
        /// </summary>
        public Task<List<ArticleSitemapRow>> GetSitemapRowsAsync(CancellationToken cancellationToken = default)
            => _dbSet
                .AsNoTracking()
                .VisibleTo(ArticleViewer.Anonymous)
                .OrderBy(article => article.Id)
                .Select(article => new ArticleSitemapRow(
                    article.Id,
                    article.ParentArticleId,
                    article.Slug,
                    article.Locale,
                    article.TranslationGroupId,
                    article.NoIndex
                        || !(article.Paragraphs.Any(paragraph => paragraph.Opinions.Any())
                            || article.InfoboxFields.Any()
                            || (article.InfoboxTitle != null && article.InfoboxTitle.Trim() != "")
                            || (article.InfoboxSubtitle != null && article.InfoboxSubtitle.Trim() != "")
                            || (article.Summary != null && article.Summary.Trim() != "")),
                    article.UpdatedAt))
                .ToListAsync(cancellationToken);

        /// <summary>
        /// Every article an anonymous reader may see (Published), projected to
        /// <see cref="ArticleRecentRow"/> in a single query with no content rows.
        /// </summary>
        public Task<List<ArticleRecentRow>> GetRecentRowsAsync(CancellationToken cancellationToken = default)
            => _dbSet
                .AsNoTracking()
                .VisibleTo(ArticleViewer.Anonymous)
                .Select(article => new ArticleRecentRow(
                    article.Id,
                    article.ParentArticleId,
                    article.Title,
                    article.Slug,
                    article.Summary,
                    article.Locale,
                    article.Paragraphs.Any(paragraph => paragraph.Opinions.Any())
                        || article.InfoboxFields.Any()
                        || (article.InfoboxTitle != null && article.InfoboxTitle.Trim() != "")
                        || (article.InfoboxSubtitle != null && article.InfoboxSubtitle.Trim() != "")
                        || (article.Summary != null && article.Summary.Trim() != ""),
                    article.PublishedAt,
                    article.UpdatedAt))
                .ToListAsync(cancellationToken);

        /// <summary>
        /// Ids of the Published articles user <paramref name="userId"/> wrote or co-authored.
        /// </summary>
        public async Task<HashSet<int>> GetPublishedIdsCreditedToAsync(int userId, CancellationToken cancellationToken = default)
            => (await _dbSet
                .AsNoTracking()
                .VisibleTo(ArticleViewer.Anonymous)
                .Where(article => article.AuthorId == userId || article.CoAuthors.Any(coAuthor => coAuthor.UserId == userId))
                .Select(article => article.Id)
                .ToListAsync(cancellationToken)).ToHashSet();

        /// <summary>
        /// One page of the articles <paramref name="viewer"/> may read, filtered and sorted by
        /// <paramref name="query"/>, and the number of matching articles. Two queries — the count and
        /// the page — and no paragraph, infobox or link rows are read.
        /// </summary>
        public async Task<(List<ArticleListRow> Rows, int Total)> GetListPageAsync(
            ArticleListQuery query, ArticleViewer viewer, CancellationToken cancellationToken = default)
        {
            var articles = _dbSet.AsNoTracking().VisibleTo(viewer);

            if (!string.IsNullOrWhiteSpace(query.Search))
            {
                var term = query.Search.Trim().ToLower();
                articles = articles.Where(article => article.Title.ToLower().Contains(term) || article.Slug.ToLower().Contains(term));
            }

            if (query.Status is ArticleStatus status)
            {
                articles = articles.Where(article => article.Status == status);
            }

            if (query.AuthorId is int authorId)
            {
                articles = articles.Where(article => article.AuthorId == authorId);
            }

            if (!string.IsNullOrWhiteSpace(query.Tag))
            {
                var tagKey = query.Tag;
                articles = articles.Where(article => article.TagLinks.Any(link => link.Tag.NormalizedName == tagKey));
            }

            if (!string.IsNullOrWhiteSpace(query.Locale))
            {
                var locale = query.Locale.Trim().ToLower();
                articles = articles.Where(article => article.Locale == locale);
            }

            var total = await articles.CountAsync(cancellationToken);
            var rows = await Sorted(articles, query.Sort, query.Direction)
                .Skip((query.Page - 1) * query.PageSize)
                .Take(query.PageSize)
                .Select(article => new ArticleListRow(
                    article.Id,
                    article.Title,
                    article.Slug,
                    article.Locale,
                    article.Status,
                    article.ParentArticleId,
                    article.AuthorId,
                    article.CoAuthors.Select(coAuthor => coAuthor.UserId).ToList(),
                    article.TagLinks.OrderBy(link => link.Order).Select(link => link.Tag.Name).ToList(),
                    article.Paragraphs.Count,
                    article.CreatedAt,
                    article.UpdatedAt,
                    article.PublishedAt))
                .ToListAsync(cancellationToken);
            return (rows, total);
        }

        private static IOrderedQueryable<Article> Sorted(IQueryable<Article> articles, ArticleListSort sort, SortDirection direction)
        {
            var descending = direction == SortDirection.Desc;
            IOrderedQueryable<Article> sorted = sort switch
            {
                ArticleListSort.CreatedAt => descending
                    ? articles.OrderByDescending(article => article.CreatedAt)
                    : articles.OrderBy(article => article.CreatedAt),
                ArticleListSort.PublishedAt => descending
                    ? articles.OrderBy(article => article.PublishedAt == null).ThenByDescending(article => article.PublishedAt)
                    : articles.OrderBy(article => article.PublishedAt == null).ThenBy(article => article.PublishedAt),
                ArticleListSort.Title => descending
                    ? articles.OrderByDescending(article => article.Title)
                    : articles.OrderBy(article => article.Title),
                // Status is stored as text; sort by the workflow instead of the alphabet.
                ArticleListSort.Status => descending
                    ? articles.OrderByDescending(article => article.Status == ArticleStatus.Draft ? 0
                        : article.Status == ArticleStatus.InReview ? 1
                        : article.Status == ArticleStatus.Published ? 2 : 3)
                    : articles.OrderBy(article => article.Status == ArticleStatus.Draft ? 0
                        : article.Status == ArticleStatus.InReview ? 1
                        : article.Status == ArticleStatus.Published ? 2 : 3),
                _ => descending
                    ? articles.OrderByDescending(article => article.UpdatedAt)
                    : articles.OrderBy(article => article.UpdatedAt),
            };
            return descending ? sorted.ThenByDescending(article => article.Id) : sorted.ThenBy(article => article.Id);
        }

        /// <summary>The article's status and owners for a permission check; null if there is no such article.</summary>
        public async Task<ArticleAccessRow?> GetAccessRowAsync(int articleId, CancellationToken cancellationToken = default)
        {
            var row = await _dbSet
                .AsNoTracking()
                .Where(article => article.Id == articleId)
                .Select(article => new
                {
                    article.Id,
                    article.Status,
                    article.AuthorId,
                    CoAuthorIds = article.CoAuthors.Select(coAuthor => coAuthor.UserId).ToList(),
                })
                .FirstOrDefaultAsync(cancellationToken);
            return row is null ? null : new ArticleAccessRow(row.Id, row.Status, row.AuthorId, row.CoAuthorIds);
        }

        public Task<Article?> GetByIdWithContentAsync(int articleId, CancellationToken cancellationToken = default)
            => _dbSet
                .Include(article => article.Paragraphs)
                    .ThenInclude(p => p.Opinions)
                        .ThenInclude(o => o.OpinionSchools)
                .Include(article => article.Paragraphs)
                    .ThenInclude(p => p.Opinions)
                        .ThenInclude(o => o.Sources)
                            .ThenInclude(c => c.Source)
                .Include(article => article.TagLinks)
                    .ThenInclude(link => link.Tag)
                .Include(article => article.InfoboxFields)
                .Include(article => article.RelatedLinks)
                    .ThenInclude(link => link.RelatedArticle)
                .Include(article => article.CoAuthors)
                .AsSplitQuery()
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
                .Include(article => article.Paragraphs)
                    .ThenInclude(p => p.Opinions)
                        .ThenInclude(o => o.Sources)
                            .ThenInclude(c => c.Source)
                .Include(article => article.TagLinks)
                    .ThenInclude(link => link.Tag)
                .Include(article => article.InfoboxFields)
                .Include(article => article.RelatedLinks)
                    .ThenInclude(link => link.RelatedArticle)
                .AsSplitQuery()
                .FirstOrDefaultAsync(article => article.Id == articleId, cancellationToken);

        /// <summary>
        /// The users credited on the article who have a display name: the author first, then the
        /// co-authors by user id. A user without a display name is left out.
        /// </summary>
        public async Task<List<ArticleCreditRow>> ListNamedCreditsAsync(int articleId, CancellationToken cancellationToken = default)
        {
            var rows = await _context.Users
                .AsNoTracking()
                .Where(user => user.DisplayName != null && user.Slug != null)
                .Select(user => new
                {
                    user.Id,
                    user.DisplayName,
                    user.Slug,
                    IsAuthor = _dbSet.Any(article => article.Id == articleId && article.AuthorId == user.Id),
                    IsCoAuthor = _dbSet.Any(article =>
                        article.Id == articleId && article.CoAuthors.Any(coAuthor => coAuthor.UserId == user.Id)),
                    HasPublicPage = _dbSet.Any(article =>
                        article.Status == ArticleStatus.Published
                        && (article.AuthorId == user.Id || article.CoAuthors.Any(coAuthor => coAuthor.UserId == user.Id)))
                })
                .Where(row => row.IsAuthor || row.IsCoAuthor)
                .OrderByDescending(row => row.IsAuthor)
                .ThenBy(row => row.Id)
                .ToListAsync(cancellationToken);

            return rows.Select(row => new ArticleCreditRow(row.DisplayName!, row.Slug!, row.HasPublicPage)).ToList();
        }

        /// <summary>The id of the article in <paramref name="locale"/> whose current slug is <paramref name="slug"/>, if any.</summary>
        public Task<int?> FindIdBySlugAsync(string locale, string slug, CancellationToken cancellationToken = default)
            => _dbSet
                .AsNoTracking()
                .Where(article => article.Locale == locale && article.Slug == slug)
                .Select(article => (int?)article.Id)
                .FirstOrDefaultAsync(cancellationToken);

        /// <summary>The current slug of the article in <paramref name="locale"/> that used to have <paramref name="oldSlug"/>, if any.</summary>
        /// <remarks>Only articles <paramref name="viewer"/> may read are considered.</remarks>
        public Task<string?> FindRedirectTargetSlugAsync(string locale, string oldSlug, ArticleViewer viewer, CancellationToken cancellationToken = default)
            => _dbSet
                .AsNoTracking()
                .VisibleTo(viewer)
                .Where(article => article.SlugRedirects.Any(redirect => redirect.Locale == locale && redirect.Slug == oldSlug))
                .Select(article => article.Slug)
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

        /// <summary>
        /// Whether <paramref name="slug"/> in <paramref name="locale"/> names a page that was removed on
        /// purpose (O-07): a slug, current or old, of an Archived article that had been published, or a
        /// tombstone of a deleted article — unless an article has taken the slug since.
        /// </summary>
        public async Task<bool> IsSlugGoneAsync(string locale, string slug, CancellationToken cancellationToken = default)
        {
            var archived = await _dbSet.AnyAsync(
                article => article.Locale == locale
                    && article.Status == ArticleStatus.Archived
                    && article.PublishedAt != null
                    && (article.Slug == slug || article.SlugRedirects.Any(redirect => redirect.Locale == locale && redirect.Slug == slug)),
                cancellationToken);
            if (archived)
            {
                return true;
            }

            return await _context.DeletedArticleSlugs.AnyAsync(deleted => deleted.Locale == locale && deleted.Slug == slug, cancellationToken)
                && !await IsSlugTakenAsync(locale, slug, exceptArticleId: null, cancellationToken);
        }

        /// <summary>
        /// Records the slugs of an article being deleted as tombstones dated <paramref name="deletedAt"/>;
        /// a slug that already has one gets the new date. Changes are saved by the caller.
        /// </summary>
        public async Task AddDeletedSlugsAsync(string locale, IReadOnlyCollection<string> slugs, DateTime deletedAt, CancellationToken cancellationToken = default)
        {
            var existing = await _context.DeletedArticleSlugs
                .Where(deleted => deleted.Locale == locale && slugs.Contains(deleted.Slug))
                .ToListAsync(cancellationToken);
            foreach (var slug in slugs)
            {
                var tombstone = existing.FirstOrDefault(deleted => deleted.Slug == slug);
                if (tombstone is null)
                {
                    _context.DeletedArticleSlugs.Add(new DeletedArticleSlug { Locale = locale, Slug = slug, DeletedAt = deletedAt });
                }
                else
                {
                    tombstone.DeletedAt = deletedAt;
                }
            }
        }

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
