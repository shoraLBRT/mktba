namespace Mktba.Domain.Entities;

/// <summary>
/// A slug of a deleted article that readers could open (O-07, #58). A request for it answers
/// 410 Gone instead of 404, so search engines drop the page. An article that takes the slug again
/// wins: the tombstone is consulted only when no article has the slug, current or old.
/// </summary>
public class DeletedArticleSlug
{
    public int Id { get; set; }

    /// <summary>The slug, current or old, the deleted article had. Unique within <see cref="Locale"/>.</summary>
    public string Slug { get; set; } = string.Empty;

    /// <summary>The deleted article's <see cref="Article.Locale"/>.</summary>
    public string Locale { get; set; } = Locales.Default;

    /// <summary>When the article was deleted (UTC).</summary>
    public DateTime DeletedAt { get; set; }
}
