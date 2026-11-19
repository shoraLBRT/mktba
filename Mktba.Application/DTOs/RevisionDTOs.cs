namespace Mktba.Application.DTOs
{
    /// <summary>
    /// The article as one revision saved it. Stored as JSON (camelCase) and returned as is. It is
    /// self-contained: related links carry the title and slug they had at save time, so a revision
    /// renders without reading the current working copy. School ids refer to <c>/schools</c>.
    /// </summary>
    /// <param name="SchemaVersion">
    /// Shape of this snapshot; <see cref="CurrentSchemaVersion"/> for new ones. Readers must handle
    /// every older version. 1: no SEO fields. 2: adds <paramref name="Seo"/>. 3: opinions carry
    /// the sources they cite (<see cref="ArticleSnapshotOpinionDto.Sources"/>).
    /// </param>
    /// <param name="Seo">SEO overrides at save time; null in version 1 snapshots, which predate them (restoring one clears the overrides).</param>
    public record ArticleSnapshotDto(
        int SchemaVersion,
        string Title,
        string Slug,
        string? Summary,
        List<string> Tags,
        ArticleSnapshotInfoboxDto? Infobox,
        List<ArticleSnapshotParagraphDto> Paragraphs,
        List<ArticleSnapshotRelatedLinkDto> RelatedLinks,
        ArticleSeoDto? Seo = null)
    {
        /// <summary>The schema version new snapshots are written with.</summary>
        public const int CurrentSchemaVersion = 3;
    }

    public record ArticleSnapshotInfoboxDto(
        string? Title,
        string? Subtitle,
        List<ArticleSnapshotInfoboxFieldDto> Fields);

    public record ArticleSnapshotInfoboxFieldDto(int Order, string Key, string Label, string Value);

    /// <param name="Order">1-based position of the paragraph in the article.</param>
    public record ArticleSnapshotParagraphDto(int Order, List<ArticleSnapshotOpinionDto> Opinions);

    /// <param name="SchoolIds">Schools the opinion is linked to; empty for a paragraph common to all schools.</param>
    /// <param name="Sources">
    /// The citations of the opinion in order; null in version 1 and 2 snapshots, which predate
    /// sources (restoring one leaves the opinions without citations).
    /// </param>
    public record ArticleSnapshotOpinionDto(
        string Content,
        bool IsDefault,
        List<int> SchoolIds,
        List<ArticleSnapshotSourceDto>? Sources = null);

    /// <summary>
    /// One citation with the directory entry as it was when the revision was saved, so the revision
    /// reads the same after the entry is edited or deleted. A restore re-links
    /// <paramref name="SourceId"/> with <paramref name="Locator"/> to the entry as it is now, and
    /// drops the citation when the entry no longer exists.
    /// </summary>
    public record ArticleSnapshotSourceDto(
        int SourceId,
        string? Locator,
        Mktba.Domain.Entities.SourceKind Kind,
        string Title,
        string? Author,
        string? Details,
        string? Url);

    /// <param name="RelatedArticleTitle">Title of the related article when the revision was saved.</param>
    /// <param name="RelatedArticleSlug">Slug of the related article when the revision was saved.</param>
    public record ArticleSnapshotRelatedLinkDto(int RelatedArticleId, string RelatedArticleTitle, string RelatedArticleSlug, int Order);

    /// <summary>One entry of an article's history (admin only).</summary>
    /// <param name="Id">Stable id of the revision; never reused.</param>
    /// <param name="Number">1, 2, 3… per article, in save order.</param>
    /// <param name="CreatedAt">When the save happened (UTC).</param>
    /// <param name="AuthorId">Who saved; null for the backfilled first revision or a deleted user.</param>
    /// <param name="AuthorEmail">The saving user's email; admin-only data.</param>
    /// <param name="Comment">The editor's note about the change, if any.</param>
    /// <param name="IsPublished">True for the revision that was current when the article was last published.</param>
    public record ArticleRevisionSummaryDto(
        int Id,
        int Number,
        DateTime CreatedAt,
        int? AuthorId,
        string? AuthorEmail,
        string? Comment,
        bool IsPublished);

    /// <summary>A revision with its snapshot.</summary>
    public record ArticleRevisionDto(ArticleRevisionSummaryDto Revision, ArticleSnapshotDto Snapshot);

    /// <summary>Two revisions of one article to compare; the client renders the difference.</summary>
    public record ArticleRevisionComparisonDto(ArticleRevisionDto From, ArticleRevisionDto To);

    /// <param name="Comment">Optional note for the new revision; defaults to «Откат к ревизии N».</param>
    public record ArticleRevisionRestoreDto(string? Comment);
}
