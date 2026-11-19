namespace Mktba.Infrastructure.Repositories
{
    /// <summary>
    /// Flat read model of one Published article for the sitemap: where it hangs in the tree,
    /// whether it may be indexed, and what its URL and translations are built from.
    /// </summary>
    public sealed record ArticleSitemapRow(
        int Id,
        int? ParentArticleId,
        string Slug,
        string Locale,
        Guid TranslationGroupId,
        bool NoIndex,
        DateTime UpdatedAt);
}
