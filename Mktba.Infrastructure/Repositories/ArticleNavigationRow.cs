using Mktba.Domain.Entities;

namespace Mktba.Infrastructure.Repositories
{
    /// <summary>
    /// Flat read model of one article for the navigation tree: no paragraph or infobox data,
    /// only its status, whether the article has any content to show and whether the viewer the
    /// rows were read for may edit it, and its language (the per-language tree, I-06).
    /// </summary>
    public sealed record ArticleNavigationRow(int Id, string Title, string Slug, int? ParentArticleId, ArticleStatus Status, bool HasContent, bool CanEdit, string Locale);
}
