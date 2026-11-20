namespace Mktba.Domain.Entities;

/// <summary>
/// A tag of one language's articles (M-06, #70): its own page at <c>/tags/{slug}</c>, renamed and
/// merged by admins. Articles carry tags through <see cref="ArticleTag"/>; a tag is found by name
/// case-insensitively (<see cref="NormalizedName"/>), so "Фикх" and "фикх" are one tag.
/// </summary>
public class Tag
{
    public int Id { get; set; }

    /// <summary>Language of the tag, one of <see cref="Locales.Supported"/>; only articles of this language carry it.</summary>
    public string Locale { get; set; } = Locales.Default;

    /// <summary>The name as readers see it: trimmed, inner white space collapsed, no comma.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>The comparison key of <see cref="Name"/>: lower case, ё folded to е. Unique per <see cref="Locale"/>.</summary>
    public string NormalizedName { get; set; } = string.Empty;

    /// <summary>URL segment of the tag page, unique per <see cref="Locale"/>; an old slug is not kept.</summary>
    public string Slug { get; set; } = string.Empty;

    public ICollection<ArticleTag> ArticleLinks { get; set; } = new List<ArticleTag>();
}
