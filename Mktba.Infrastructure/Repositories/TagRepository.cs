using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.Repositories;

/// <summary>A tag of the admin list with the number of articles carrying it, whatever their status.</summary>
public sealed record TagListRow(int Id, string Locale, string Name, string Slug, int ArticleCount);

public class TagRepository : GenericRepository<Tag>
{
    public TagRepository(MktbaDbContext context) : base(context) { }

    /// <summary>The tracked tags of <paramref name="locale"/> whose comparison keys are among <paramref name="keys"/>.</summary>
    public Task<List<Tag>> FindByKeysAsync(string locale, IReadOnlyCollection<string> keys, CancellationToken cancellationToken = default)
        => _dbSet.Where(t => t.Locale == locale && keys.Contains(t.NormalizedName)).ToListAsync(cancellationToken);

    /// <summary>Another tag of <paramref name="locale"/> with the comparison key, or null.</summary>
    public Task<Tag?> FindByKeyAsync(string locale, string key, int exceptId, CancellationToken cancellationToken = default)
        => _dbSet.AsNoTracking().FirstOrDefaultAsync(t => t.Locale == locale && t.NormalizedName == key && t.Id != exceptId, cancellationToken);

    public Task<Tag?> FindBySlugAsync(string locale, string slug, CancellationToken cancellationToken = default)
        => _dbSet.AsNoTracking().FirstOrDefaultAsync(t => t.Locale == locale && t.Slug == slug, cancellationToken);

    public Task<bool> IsSlugTakenAsync(string locale, string slug, int? exceptId, CancellationToken cancellationToken = default)
        => _dbSet.AnyAsync(t => t.Locale == locale && t.Slug == slug && t.Id != exceptId, cancellationToken);

    /// <summary>Every tag, optionally of one language, by name, with its article count.</summary>
    public Task<List<TagListRow>> ListAsync(string? locale, CancellationToken cancellationToken = default)
    {
        var tags = _dbSet.AsNoTracking();
        if (locale is not null)
        {
            tags = tags.Where(t => t.Locale == locale);
        }

        return tags
            .OrderBy(t => t.Locale).ThenBy(t => t.NormalizedName).ThenBy(t => t.Id)
            .Select(t => new TagListRow(t.Id, t.Locale, t.Name, t.Slug, t.ArticleLinks.Count))
            .ToListAsync(cancellationToken);
    }

    /// <summary>Ids of the Published articles carrying the tag.</summary>
    public async Task<HashSet<int>> GetPublishedArticleIdsAsync(int tagId, CancellationToken cancellationToken = default)
        => (await _context.ArticleTags
            .AsNoTracking()
            .Where(link => link.TagId == tagId)
            .Select(link => link.Article)
            .VisibleTo(ArticleViewer.Anonymous)
            .Select(article => article.Id)
            .ToListAsync(cancellationToken)).ToHashSet();

    /// <summary>
    /// The tracked articles carrying any of <paramref name="tagIds"/>, each with all its tag links
    /// and their tags, for rewriting the links and the search copy.
    /// </summary>
    public Task<List<Article>> GetArticlesCarryingAsync(IReadOnlyCollection<int> tagIds, CancellationToken cancellationToken = default)
        => _context.Articles
            .IgnoreQueryFilters()
            .Include(article => article.TagLinks)
                .ThenInclude(link => link.Tag)
            .Where(article => article.TagLinks.Any(link => tagIds.Contains(link.TagId)))
            .ToListAsync(cancellationToken);
}
