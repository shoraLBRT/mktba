namespace Mktba.Domain.Entities;

/// <summary>
/// A slug an article used before. Old links keep working: a request for <see cref="Slug"/>
/// is redirected to the article's current slug.
/// </summary>
public class ArticleSlugRedirect
{
    public int Id { get; set; }

    /// <summary>The former slug. Unique within <see cref="Locale"/>, and never equal to a current slug there.</summary>
    public string Slug { get; set; } = string.Empty;

    /// <summary>The article's <see cref="Article.Locale"/>, copied so slugs can be unique per language.</summary>
    public string Locale { get; set; } = Locales.Default;

    public int ArticleId { get; set; }

    public Article Article { get; set; } = null!;
}
