using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services;

/// <summary>
/// Puts tag names on an article (M-06, #70): each name becomes the tag of the article's language
/// with the same comparison key, created on first use with a slug of its own. The only writer of
/// <see cref="Article.TagLinks"/> on a content save, and with <see cref="SyncSearchText"/> of
/// <see cref="Article.TagsSearchText"/>.
/// </summary>
public sealed class ArticleTagAssigner
{
    private readonly TagRepository _tags;

    public ArticleTagAssigner(TagRepository tags)
    {
        _tags = tags;
    }

    /// <summary>
    /// Replaces the article's tags by <paramref name="names"/>, already through
    /// <see cref="TagRules.NormalizeList"/>, keeping their order. The article's
    /// <see cref="Article.TagLinks"/> must be loaded (or empty for a new article). New tags are added
    /// to the context; nothing is saved.
    /// </summary>
    public async Task ApplyAsync(Article article, IReadOnlyList<string> names, CancellationToken cancellationToken = default)
    {
        var keys = names.Select(TagRules.KeyOf).ToList();
        var existing = keys.Count == 0
            ? []
            : (await _tags.FindByKeysAsync(article.Locale, keys, cancellationToken)).ToDictionary(t => t.NormalizedName);

        var wanted = new List<Tag>(names.Count);
        var takenSlugs = new HashSet<string>(StringComparer.Ordinal);
        for (var index = 0; index < names.Count; index++)
        {
            if (!existing.TryGetValue(keys[index], out var tag))
            {
                tag = new Tag
                {
                    Locale = article.Locale,
                    Name = names[index],
                    NormalizedName = keys[index],
                    Slug = await ChooseSlugAsync(article.Locale, names[index], takenSlugs, cancellationToken),
                };
                await _tags.AddAsync(tag);
                existing[keys[index]] = tag;
            }

            wanted.Add(tag);
        }

        foreach (var link in article.TagLinks.Where(link => !wanted.Contains(link.Tag)).ToList())
        {
            article.TagLinks.Remove(link);
        }

        for (var order = 0; order < wanted.Count; order++)
        {
            var link = article.TagLinks.FirstOrDefault(l => l.Tag == wanted[order]);
            if (link is null)
            {
                article.TagLinks.Add(new ArticleTag { Article = article, Tag = wanted[order], Order = order });
            }
            else
            {
                link.Order = order;
            }
        }

        SyncSearchText(article);
    }

    /// <summary>The names of the article's tags in order, from the loaded links and their tags.</summary>
    public static List<string> NamesOf(Article article)
        => article.TagLinks.OrderBy(l => l.Order).Select(l => l.Tag.Name).ToList();

    /// <summary>Rewrites <see cref="Article.TagsSearchText"/> from the loaded links and their tags.</summary>
    public static void SyncSearchText(Article article)
        => article.TagsSearchText = TagRules.SearchText(NamesOf(article));

    private async Task<string> ChooseSlugAsync(string locale, string name, HashSet<string> takenSlugs, CancellationToken cancellationToken)
    {
        var baseSlug = TagRules.SlugFromName(name);
        for (var number = 1; ; number++)
        {
            var candidate = ArticleSlugRules.WithSuffix(baseSlug, number);
            if (!takenSlugs.Contains(candidate) && !await _tags.IsSlugTakenAsync(locale, candidate, exceptId: null, cancellationToken))
            {
                takenSlugs.Add(candidate);
                return candidate;
            }
        }
    }
}
