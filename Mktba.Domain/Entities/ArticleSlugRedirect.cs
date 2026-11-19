namespace Mktba.Domain.Entities;

/// <summary>
/// A slug an article used before. Old links keep working: a request for <see cref="Slug"/>
/// is redirected to the article's current slug.
/// </summary>
public class ArticleSlugRedirect
{
    public int Id { get; set; }

    /// <summary>The former slug. Unique, and never equal to any article's current slug.</summary>
    public string Slug { get; set; } = string.Empty;

    public int ArticleId { get; set; }

    public Article Article { get; set; } = null!;
}
