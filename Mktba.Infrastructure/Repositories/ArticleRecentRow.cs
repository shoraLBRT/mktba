namespace Mktba.Infrastructure.Repositories
{
    /// <summary>
    /// Flat read model of one Published article for the lists of new and updated articles: where it
    /// hangs in the tree, what a list entry shows, and the dates the lists are ordered by.
    /// </summary>
    /// <param name="Locale">Language of the article; the lists are built per language.</param>
    /// <param name="HasContent">False for a stub with no text yet — left out of the lists.</param>
    /// <param name="PublishedAt">When the article first became Published (UTC).</param>
    /// <param name="UpdatedAt">When its content or metadata was last saved (UTC).</param>
    public sealed record ArticleRecentRow(
        int Id,
        int? ParentArticleId,
        string Title,
        string Slug,
        string? Summary,
        string Locale,
        bool HasContent,
        DateTime? PublishedAt,
        DateTime UpdatedAt);
}
