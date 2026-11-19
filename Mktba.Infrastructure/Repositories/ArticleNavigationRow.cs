namespace Mktba.Infrastructure.Repositories
{
    /// <summary>
    /// Flat read model of one article for the navigation tree: no paragraph or infobox data,
    /// only whether the article has any content to show.
    /// </summary>
    public sealed record ArticleNavigationRow(int Id, string Title, int? ParentArticleId, bool HasContent);
}
