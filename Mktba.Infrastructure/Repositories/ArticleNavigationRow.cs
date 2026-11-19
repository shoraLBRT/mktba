using Mktba.Domain.Entities;

namespace Mktba.Infrastructure.Repositories
{
    /// <summary>
    /// Flat read model of one article for the navigation tree: no paragraph or infobox data,
    /// only its status and whether the article has any content to show.
    /// </summary>
    public sealed record ArticleNavigationRow(int Id, string Title, string Slug, int? ParentArticleId, ArticleStatus Status, bool HasContent);
}
