using System.Globalization;
using Mktba.Application.Exceptions;
using Mktba.Infrastructure.Data;

namespace Mktba.Application.Services;

/// <summary>
/// Rules for tag names and slugs (M-06, #70). The migration <c>AddTags</c> applies the same
/// normalization to the tags it backfills from the old comma-separated column.
/// </summary>
public static class TagRules
{
    public const int NameMaxLength = MktbaDbContext.TagNameMaxLength;

    /// <summary>
    /// Most tags one article carries; with <see cref="NameMaxLength"/> the search copy of the names
    /// stays within <see cref="MktbaDbContext.ArticleTagsSearchTextMaxLength"/>.
    /// </summary>
    public const int MaxPerArticle = 16;

    /// <summary>The word a tag slug falls back to when nothing in the name transliterates.</summary>
    public const string SlugFallback = "tag";

    /// <summary>The name as stored: trimmed, every run of white space one space.</summary>
    public static string Normalize(string? name)
        => string.Join(' ', (name ?? string.Empty).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

    /// <summary>The comparison key of a normalized name: lower case, ё folded to е.</summary>
    public static string KeyOf(string normalizedName)
        => normalizedName.ToLowerInvariant().Replace('ё', 'е');

    /// <summary>The first problem of a normalized name, or null.</summary>
    public static AppError? Check(string normalizedName)
    {
        if (normalizedName.Length == 0)
        {
            return AppErrors.TagNameRequired;
        }

        if (normalizedName.Length > NameMaxLength)
        {
            return AppErrors.TagNameTooLong(NameMaxLength);
        }

        return normalizedName.Any(c => c == ',' || char.IsControl(c) || CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.Format)
            ? AppErrors.TagNameInvalid
            : null;
    }

    /// <summary>
    /// An article's tag names as they will be stored: normalized, blanks dropped, a name repeated in
    /// another case kept once (the first spelling). Checked against <see cref="Check"/> and
    /// <see cref="MaxPerArticle"/>.
    /// </summary>
    /// <exception cref="ValidationException">A name is invalid, or there are too many.</exception>
    public static List<string> NormalizeList(IEnumerable<string>? names)
    {
        var result = new List<string>();
        var keys = new HashSet<string>(StringComparer.Ordinal);
        foreach (var raw in names ?? [])
        {
            var name = Normalize(raw);
            if (name.Length == 0)
            {
                continue;
            }

            if (Check(name) is { } error)
            {
                throw new ValidationException(error);
            }

            if (keys.Add(KeyOf(name)))
            {
                result.Add(name);
            }
        }

        if (result.Count > MaxPerArticle)
        {
            throw new ValidationException(AppErrors.ArticleTooManyTags(MaxPerArticle));
        }

        return result;
    }

    /// <summary>The slug a name gives: <see cref="ArticleSlugRules.FromTitle"/> with <see cref="SlugFallback"/>.</summary>
    public static string SlugFromName(string name) => ArticleSlugRules.FromTitle(name, SlugFallback);

    /// <summary>The search copy of an article's tag names, in order; null when there are none.</summary>
    public static string? SearchText(IEnumerable<string> orderedNames)
    {
        var joined = string.Join(',', orderedNames);
        return joined.Length == 0 ? null : joined;
    }
}
