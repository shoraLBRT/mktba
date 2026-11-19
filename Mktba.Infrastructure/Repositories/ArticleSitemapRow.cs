namespace Mktba.Infrastructure.Repositories
{
    /// <summary>
    /// Flat read model of one Published article for the sitemap: where it hangs in the tree,
    /// whether it may be indexed, and what its URL and translations are built from.
    /// </summary>
    /// <param name="NoIndex">Marked noindex, or a stub with no content yet (O-07) — left out of the sitemap.</param>
    public sealed record ArticleSitemapRow(
        int Id,
        int? ParentArticleId,
        string Slug,
        string Locale,
        Guid TranslationGroupId,
        bool NoIndex,
        DateTime UpdatedAt);
}
