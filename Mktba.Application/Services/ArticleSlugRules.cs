using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Application.Services;

/// <summary>
/// Pure rules for article slugs: how a title becomes a slug and what a valid slug looks like.
/// The same transliteration runs in three places and must stay identical: here, in the backfill
/// of migration <c>AddArticleSlugs</c>, and in <c>mktba.react/src/shared/slug.ts</c> (the editor's
/// prefill).
/// </summary>
public static partial class ArticleSlugRules
{
    public const int MaxLength = MktbaDbContext.ArticleSlugMaxLength;

    /// <summary>Slug used when the title has nothing to transliterate (empty, punctuation, other scripts).</summary>
    public const string Fallback = "article";

    /// <summary>
    /// First URL segments an article cannot take, because articles live at <c>/{slug}</c> (O-02, #53):
    /// the site's other top-level routes, the old <c>/article/…</c> prefix, the build's static
    /// directory and the language prefixes (<see cref="Locales.Supported"/>). Files such as
    /// <c>robots.txt</c> or <c>sitemap.xml</c> need no entry: a dot is never valid in a slug.
    /// <see cref="Fallback"/> is reserved too, so a title with nothing to transliterate gets <c>article-2</c>.
    /// Mirror: <c>RESERVED_ARTICLE_SLUGS</c> in <c>mktba.react/src/shared/slug.ts</c>; existing rows
    /// were moved off these words by migration <c>MoveArticlesOffReservedSlugs</c>.
    /// </summary>
    public static readonly IReadOnlySet<string> Reserved = new HashSet<string>(
        ["admin", "api", "article", "articles", "assets", "authors", "feedback", "login", "search", "sitemaps", .. Locales.Supported],
        StringComparer.Ordinal);

    /// <summary>
    /// Russian letters to Latin. ъ and ь are dropped. Letters outside this table and outside
    /// a–z, 0–9 lose their diacritics (ā → a) or, failing that, become word separators.
    /// </summary>
    private static readonly IReadOnlyDictionary<char, string> Cyrillic = new Dictionary<char, string>
    {
        ['а'] = "a", ['б'] = "b", ['в'] = "v", ['г'] = "g", ['д'] = "d", ['е'] = "e", ['ё'] = "yo",
        ['ж'] = "zh", ['з'] = "z", ['и'] = "i", ['й'] = "y", ['к'] = "k", ['л'] = "l", ['м'] = "m",
        ['н'] = "n", ['о'] = "o", ['п'] = "p", ['р'] = "r", ['с'] = "s", ['т'] = "t", ['у'] = "u",
        ['ф'] = "f", ['х'] = "kh", ['ц'] = "ts", ['ч'] = "ch", ['ш'] = "sh", ['щ'] = "shch", ['ъ'] = "",
        ['ы'] = "y", ['ь'] = "", ['э'] = "e", ['ю'] = "yu", ['я'] = "ya",
    };

    /// <summary>Apostrophes and ayn/hamza marks are removed inside a word (Qur'an → quran), not turned into hyphens.</summary>
    private const string Apostrophes = "'’ʼʻʿʾ`";

    [GeneratedRegex("^[a-z0-9]+(?:-[a-z0-9]+)*$")]
    private static partial Regex SlugPattern();

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonSlugCharacters();

    /// <summary>
    /// Turns a title into a slug: lowercase, Russian transliterated, diacritics stripped,
    /// everything else collapsed into single hyphens, trimmed to <see cref="MaxLength"/>.
    /// A result of digits only gets the <c>article-</c> prefix, an empty one is <see cref="Fallback"/>.
    /// </summary>
    /// <param name="fallback">
    /// The word used instead of <see cref="Fallback"/> by slugs of something other than an article
    /// (user profiles: <see cref="UserProfileRules.SlugFallback"/>).
    /// </param>
    public static string FromTitle(string? title, string fallback = Fallback)
    {
        var lowered = (title ?? string.Empty).ToLowerInvariant();

        var transliterated = new StringBuilder(lowered.Length);
        foreach (var character in lowered)
        {
            if (Cyrillic.TryGetValue(character, out var latin))
            {
                transliterated.Append(latin);
            }
            else if (!Apostrophes.Contains(character))
            {
                transliterated.Append(character);
            }
        }

        var withoutMarks = new StringBuilder(transliterated.Length);
        foreach (var character in transliterated.ToString().Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)
            {
                withoutMarks.Append(character);
            }
        }

        var slug = NonSlugCharacters().Replace(withoutMarks.ToString(), "-").Trim('-');
        if (slug.Length == 0)
        {
            return fallback;
        }

        if (slug.All(char.IsAsciiDigit))
        {
            slug = $"{fallback}-{slug}";
        }

        return Truncate(slug, MaxLength);
    }

    /// <summary>The <paramref name="number"/>-th candidate for a base slug: the base itself, then base-2, base-3, …</summary>
    public static string WithSuffix(string baseSlug, int number)
    {
        if (number <= 1)
        {
            return baseSlug;
        }

        var suffix = $"-{number}";
        return Truncate(baseSlug, MaxLength - suffix.Length) + suffix;
    }

    /// <summary>
    /// A valid slug: 1–<see cref="MaxLength"/> characters of a–z and 0–9 in hyphen-separated
    /// groups, and not digits only — a numeric segment stays reserved for <c>/article/{id}</c> links.
    /// A valid slug may still be <see cref="IsReserved"/>.
    /// </summary>
    public static bool IsValid(string? slug)
        => !string.IsNullOrEmpty(slug)
           && slug.Length <= MaxLength
           && SlugPattern().IsMatch(slug)
           && !slug.All(char.IsAsciiDigit);

    /// <summary>Whether <paramref name="slug"/> is one of the <see cref="Reserved"/> first URL segments.</summary>
    public static bool IsReserved(string slug) => Reserved.Contains(slug);

    private static string Truncate(string slug, int length)
        => slug.Length <= length ? slug : slug[..length].TrimEnd('-');
}
