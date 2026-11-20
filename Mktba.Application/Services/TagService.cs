using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;
using Mktba.Infrastructure.UnitOfWork;

namespace Mktba.Application.Services;

/// <summary>
/// Tags as an entity (M-06, #70): the public tag page and the admin's rename and merge. Neither
/// writes a revision or changes an article's <see cref="Article.UpdatedAt"/>: a tag is shared
/// metadata, like a source entry; revisions keep the names as they were saved.
/// </summary>
public class TagService
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 50;

    private readonly TagRepository _tags;
    private readonly ArticleRepository _articles;
    private readonly IUnitOfWork _uow;

    public TagService(TagRepository tags, ArticleRepository articles, IUnitOfWork uow)
    {
        _tags = tags;
        _articles = articles;
        _uow = uow;
    }

    /// <summary>
    /// The articles of the tag at <paramref name="slug"/> an anonymous reader reaches — Published,
    /// every ancestor Published, no empty stubs, the rule of the author page — by first publication,
    /// newest first. A tag no such article carries has no page, so a tag of drafts only is not shown.
    /// </summary>
    /// <param name="requestedLocale">Language of the tag; null or blank means <see cref="Locales.Default"/>.</param>
    /// <param name="page">Page from 1; anything lower is read as 1.</param>
    /// <param name="pageSize">Entries per page; kept within 1 to <see cref="MaxPageSize"/>.</param>
    /// <exception cref="ValidationException">locale_unsupported.</exception>
    /// <exception cref="NotFoundException">tag_not_found: no such tag, or no article a reader can open carries it.</exception>
    public async Task<TagPageDto> GetPageAsync(
        string slug, string? requestedLocale, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        var locale = Locales.Normalize(requestedLocale)
            ?? throw new ValidationException(AppErrors.LocaleUnsupported(requestedLocale!));
        var tag = await _tags.FindBySlugAsync(locale, slug.Trim().ToLowerInvariant(), cancellationToken)
            ?? throw new NotFoundException(AppErrors.TagNotFound);
        var currentPage = Math.Max(page, 1);
        var size = Math.Clamp(pageSize, 1, MaxPageSize);

        var tagged = await _tags.GetPublishedArticleIdsAsync(tag.Id, cancellationToken);
        var rows = await _articles.GetRecentRowsAsync(cancellationToken);
        var isReachable = ArticleReachability.Among(rows);
        var listed = rows
            .Where(row => tagged.Contains(row.Id) && row.HasContent && row.PublishedAt is not null && isReachable(row))
            .OrderByDescending(row => row.PublishedAt)
            .ThenByDescending(row => row.Id)
            .ToList();
        if (listed.Count == 0)
        {
            throw new NotFoundException(AppErrors.TagNotFound);
        }

        return new TagPageDto(
            tag.Name,
            tag.Slug,
            listed.Count,
            currentPage,
            size,
            listed
                .Skip((int)Math.Min((long)(currentPage - 1) * size, int.MaxValue))
                .Take(size)
                .Select(row => new AuthorArticleDto(row.Id, row.Title, row.Slug, row.Summary, row.PublishedAt!.Value, row.UpdatedAt))
                .ToList());
    }

    /// <summary>Every tag, optionally of one language, by name, with the number of articles carrying it.</summary>
    /// <exception cref="ValidationException">locale_unsupported.</exception>
    public async Task<List<TagDto>> ListAsync(string? requestedLocale, CancellationToken cancellationToken = default)
    {
        string? locale = null;
        if (!string.IsNullOrWhiteSpace(requestedLocale))
        {
            locale = Locales.Normalize(requestedLocale)
                ?? throw new ValidationException(AppErrors.LocaleUnsupported(requestedLocale));
        }

        return (await _tags.ListAsync(locale, cancellationToken))
            .Select(row => new TagDto(row.Id, row.Locale, row.Name, row.Slug, row.ArticleCount))
            .ToList();
    }

    /// <summary>
    /// Renames a tag on every article carrying it, and optionally changes its slug. A name only in
    /// another case is a rename of the same tag; a name another tag has is refused — merge instead.
    /// </summary>
    /// <exception cref="NotFoundException">tag_not_found.</exception>
    /// <exception cref="ValidationException">tag_name_*, tag_slug_invalid, tag_slug_taken.</exception>
    public async Task<TagDto> RenameAsync(int id, TagRenameDto dto, CancellationToken cancellationToken = default)
    {
        var tag = await _tags.GetByIdAsync(id) ?? throw new NotFoundException(AppErrors.TagNotFound);
        var name = TagRules.Normalize(dto.Name);
        if (TagRules.Check(name) is { } nameError)
        {
            throw new ValidationException(nameError);
        }

        var key = TagRules.KeyOf(name);
        if (await _tags.FindByKeyAsync(tag.Locale, key, tag.Id, cancellationToken) is { } other)
        {
            throw new ValidationException(AppErrors.TagNameTaken(other.Id));
        }

        var slug = tag.Slug;
        if (!string.IsNullOrWhiteSpace(dto.Slug))
        {
            slug = dto.Slug.Trim().ToLowerInvariant();
            if (!ArticleSlugRules.IsValid(slug))
            {
                throw new ValidationException(AppErrors.TagSlugInvalid);
            }

            if (await _tags.IsSlugTakenAsync(tag.Locale, slug, tag.Id, cancellationToken))
            {
                throw new ValidationException(AppErrors.TagSlugTaken(slug));
            }
        }

        var articles = await _tags.GetArticlesCarryingAsync([tag.Id], cancellationToken);
        tag.Name = name;
        tag.NormalizedName = key;
        tag.Slug = slug;
        foreach (var article in articles)
        {
            ArticleTagAssigner.SyncSearchText(article);
        }

        await _uow.SaveChangesAsync();
        return new TagDto(tag.Id, tag.Locale, tag.Name, tag.Slug, articles.Count);
    }

    /// <summary>
    /// Merges tag <paramref name="id"/> into <see cref="TagMergeDto.IntoTagId"/>: every article
    /// carrying it carries the remaining tag instead, at the same place (an article that already
    /// carries both keeps the remaining tag where it was), and the merged tag is deleted — its page
    /// answers 404.
    /// </summary>
    /// <exception cref="NotFoundException">tag_not_found: either tag is missing.</exception>
    /// <exception cref="ValidationException">tag_merge_into_itself, tag_merge_locale_mismatch.</exception>
    public async Task<TagDto> MergeAsync(int id, TagMergeDto dto, CancellationToken cancellationToken = default)
    {
        if (dto.IntoTagId == id)
        {
            throw new ValidationException(AppErrors.TagMergeIntoItself);
        }

        var merged = await _tags.GetByIdAsync(id) ?? throw new NotFoundException(AppErrors.TagNotFound);
        var into = await _tags.GetByIdAsync(dto.IntoTagId) ?? throw new NotFoundException(AppErrors.TagNotFound);
        if (merged.Locale != into.Locale)
        {
            throw new ValidationException(AppErrors.TagMergeLocaleMismatch);
        }

        var articles = await _tags.GetArticlesCarryingAsync([merged.Id, into.Id], cancellationToken);
        foreach (var article in articles)
        {
            var mergedLink = article.TagLinks.FirstOrDefault(link => link.TagId == merged.Id);
            if (mergedLink is null)
            {
                continue;
            }

            article.TagLinks.Remove(mergedLink);
            if (article.TagLinks.All(link => link.TagId != into.Id))
            {
                article.TagLinks.Add(new ArticleTag { Article = article, Tag = into, Order = mergedLink.Order });
            }

            var order = 0;
            foreach (var link in article.TagLinks.OrderBy(link => link.Order).ToList())
            {
                link.Order = order++;
            }

            ArticleTagAssigner.SyncSearchText(article);
        }

        await _tags.DeleteAsync(merged);
        await _uow.SaveChangesAsync();
        return new TagDto(into.Id, into.Locale, into.Name, into.Slug, articles.Count);
    }
}
