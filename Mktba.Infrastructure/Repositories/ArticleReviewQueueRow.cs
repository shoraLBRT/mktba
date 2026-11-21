using Mktba.Domain.Entities;

namespace Mktba.Infrastructure.Repositories
{
    /// <summary>One article waiting for review (A-04, #87), as the moderation queue lists it.</summary>
    /// <param name="SubmittedAt">The latest move to InReview; null for an article moved there before moves were logged.</param>
    /// <param name="LatestRevisionNumber">The article's newest revision, 0 if it has none.</param>
    /// <param name="PublishedRevisionNumber">The revision last published, null if the article never was.</param>
    public sealed record ArticleReviewQueueRow(
        int Id,
        string Title,
        string Slug,
        string Locale,
        int? AuthorId,
        string? AuthorDisplayName,
        DateTime UpdatedAt,
        DateTime? PublishedAt,
        DateTime? SubmittedAt,
        int LatestRevisionNumber,
        int? PublishedRevisionNumber);
}
