using Mktba.Domain.Entities;

namespace Mktba.Infrastructure.Repositories
{
    /// <summary>Flat read model of one trashed article for the admin trash (M-11, #133).</summary>
    /// <param name="Status">The status the article had when trashed; restoring keeps it.</param>
    /// <param name="DeletedAt">When it was moved to the trash (UTC).</param>
    /// <param name="DeletedByDisplayName">Who moved it there; null when unknown or that user has no display name.</param>
    /// <param name="ParentTitle">Title of the parent it is restored under; null for a root article.</param>
    /// <param name="ParentInTrash">True when the parent is in the trash too: it has to be restored first.</param>
    public sealed record ArticleTrashRow(
        int Id,
        string Title,
        string Slug,
        string Locale,
        ArticleStatus Status,
        DateTime DeletedAt,
        string? DeletedByDisplayName,
        int? ParentArticleId,
        string? ParentTitle,
        bool ParentInTrash);
}
