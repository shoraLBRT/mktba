using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs
{
    public class ArticleReadDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        /// <summary>URL segment of the article, generated from the title on create.</summary>
        public string Slug { get; set; } = string.Empty;
        public int? ParentArticleId { get; set; }
        /// <summary>Position among the siblings, 0 first; the tree sorts siblings by Order, then by Id.</summary>
        public int Order { get; set; }
        /// <summary>Publication status; anonymous readers only ever see Published.</summary>
        public ArticleStatus Status { get; set; }
        /// <summary>Statuses the article may move to next, from <c>ArticleStatusTransitions</c>.</summary>
        public List<ArticleStatus> AllowedTransitions { get; set; } = new();
        public bool HasContent { get; set; }
        /// <summary>When the article was created (UTC).</summary>
        public DateTime CreatedAt { get; set; }
        /// <summary>When the article's content or metadata was last saved (UTC).</summary>
        public DateTime UpdatedAt { get; set; }
        /// <summary>When the article was first published (UTC); kept through archiving and re-publishing.</summary>
        public DateTime? PublishedAt { get; set; }
        /// <summary>Id of the user who created the article; null for articles from before authorship was recorded.</summary>
        public int? AuthorId { get; set; }
        /// <summary>
        /// The article's latest status move with its comment (A-04, #87) — how an author learns why a
        /// reviewer returned the article. Given only to those who may edit the article, on the
        /// single-article reads and the answer to a status move; null otherwise or when no move was logged.
        /// </summary>
        public ArticleStatusChangeEntryDto? LastStatusChange { get; set; }
    }

    /// <summary>Request to move an article to another status; see <c>ArticleStatusTransitions</c>.</summary>
    public class ArticleStatusChangeDto
    {
        public ArticleStatus Status { get; set; }
        /// <summary>
        /// Optional note kept with the move (A-04, #87), such as the reason a reviewer returns an
        /// article to its author; trimmed, blank means none, at most 2000 characters.
        /// </summary>
        public string? Comment { get; set; }
    }

    /// <summary>One logged status move of an article (A-04, #87).</summary>
    public class ArticleStatusChangeEntryDto
    {
        public ArticleStatus FromStatus { get; set; }
        public ArticleStatus ToStatus { get; set; }
        /// <summary>When the move happened (UTC).</summary>
        public DateTime ChangedAt { get; set; }
        /// <summary>The display name of whoever made the move; null when they have none or were deleted.</summary>
        public string? ChangedByDisplayName { get; set; }
        public string? Comment { get; set; }
    }

    /// <summary>One article of the moderation queue (A-04, #87): waiting for review, no content.</summary>
    public class ReviewQueueItemDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Slug { get; set; } = string.Empty;
        public string Locale { get; set; } = string.Empty;
        public int? AuthorId { get; set; }
        /// <summary>The author's display name; null when they have none or the article has no author.</summary>
        public string? AuthorDisplayName { get; set; }
        /// <summary>When the article was last submitted for review (UTC); null if before moves were logged.</summary>
        public DateTime? SubmittedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public DateTime? PublishedAt { get; set; }
        /// <summary>The newest revision — what approval publishes; 0 when the article has none.</summary>
        public int LatestRevisionNumber { get; set; }
        /// <summary>The revision last published, to compare with; null when the article was never published.</summary>
        public int? PublishedRevisionNumber { get; set; }
    }

    /// <summary>Request to move an article to another parent and/or position among its siblings.</summary>
    public class ArticleMoveDto
    {
        /// <summary>The new parent; null makes the article a root. May equal the current parent to reorder only.</summary>
        public int? ParentArticleId { get; set; }
        /// <summary>
        /// 0-based position among the new parent's other children; null or past the end appends,
        /// a negative value means the first position.
        /// </summary>
        public int? Index { get; set; }
    }

    /// <summary>Request to create an article; it is placed last among its siblings.</summary>
    public class ArticleCreateDto
    {
        public string Title { get; set; } = string.Empty;
        public int? ParentArticleId { get; set; }
    }

    public class ArticleUpdateDto
    {
        public string Title { get; set; } = string.Empty;
        /// <summary>A changed parent is validated like a move and places the article last under it.</summary>
        public int? ParentArticleId { get; set; }
    }

    /// <summary>An article as the admin list (A-02, #34) shows it: metadata only, no content.</summary>
    public class ArticleListItemDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Slug { get; set; } = string.Empty;
        /// <summary>Language of the article, e.g. "ru".</summary>
        public string Locale { get; set; } = string.Empty;
        public ArticleStatus Status { get; set; }
        /// <summary>The status moves the caller may make on this article.</summary>
        public List<ArticleStatus> AllowedTransitions { get; set; } = new();
        public int? ParentArticleId { get; set; }
        /// <summary>Id of the article's author; null for articles from before authorship was recorded.</summary>
        public int? AuthorId { get; set; }
        public List<string> Tags { get; set; } = new();
        /// <summary>Number of paragraphs in the working copy.</summary>
        public int ParagraphCount { get; set; }
        /// <summary>Whether the caller may open the article in the editor.</summary>
        public bool CanEdit { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public DateTime? PublishedAt { get; set; }
        /// <summary>The latest logged status move (with a reviewer's comment, if any); only for articles the caller may edit.</summary>
        public ArticleStatusChangeEntryDto? LastStatusChange { get; set; }
    }

    /// <summary>
    /// Article counts for the admin dashboard (A-07, #95), over the articles the caller may see.
    /// </summary>
    public class ArticleSummaryDto
    {
        /// <summary>Number of articles.</summary>
        public int Total { get; set; }
        /// <summary>Articles with content: an opinion, an infobox or a summary (the rule of hasContent).</summary>
        public int WithContent { get; set; }
        /// <summary>Articles without content: Total minus WithContent.</summary>
        public int Empty { get; set; }
        /// <summary>Number of articles in each status.</summary>
        public ArticleStatusCountsDto ByStatus { get; set; } = new();
    }

    /// <summary>Number of articles in each status.</summary>
    public class ArticleStatusCountsDto
    {
        public int Draft { get; set; }
        public int InReview { get; set; }
        public int Published { get; set; }
        public int Archived { get; set; }
    }

    /// <summary>One page of the admin article list.</summary>
    public class ArticleListPageDto
    {
        public List<ArticleListItemDto> Items { get; set; } = new();
        /// <summary>Number of articles matching the filters, over all pages.</summary>
        public int Total { get; set; }
        /// <summary>The 1-based page returned, after bounds were applied.</summary>
        public int Page { get; set; }
        /// <summary>The page size used, after bounds were applied (1 to 100).</summary>
        public int PageSize { get; set; }
    }

    /// <summary>Request to move several articles to one status; each is checked like a single move.</summary>
    public class ArticleBulkStatusDto
    {
        /// <summary>The articles to move, at most 100; duplicates are ignored.</summary>
        public List<int> Ids { get; set; } = new();
        public ArticleStatus Status { get; set; }
    }

    /// <summary>What happened to one article of a bulk action.</summary>
    public class ArticleBulkItemResultDto
    {
        public int Id { get; set; }
        public bool Ok { get; set; }
        /// <summary>The API error code when <see cref="Ok"/> is false (e.g. forbidden, article_not_found); null on success.</summary>
        public string? Code { get; set; }
    }

    /// <summary>The per-article results of a bulk action, in the order of the request's ids.</summary>
    public class ArticleBulkResultDto
    {
        public List<ArticleBulkItemResultDto> Results { get; set; } = new();
    }

    /// <summary>One article in the admin trash (M-11, #133).</summary>
    public class ArticleTrashItemDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        /// <summary>Kept reserved while the article is in the trash.</summary>
        public string Slug { get; set; } = string.Empty;
        public string Locale { get; set; } = string.Empty;
        /// <summary>The status it had when trashed; restoring keeps it.</summary>
        public ArticleStatus Status { get; set; }
        /// <summary>When it was moved to the trash (UTC).</summary>
        public DateTime DeletedAt { get; set; }
        public string? DeletedByDisplayName { get; set; }
        /// <summary>The parent it is restored under; null for a root article.</summary>
        public int? ParentArticleId { get; set; }
        public string? ParentTitle { get; set; }
        /// <summary>True when the parent is in the trash too, so this article cannot be restored before it.</summary>
        public bool ParentInTrash { get; set; }
    }
}
