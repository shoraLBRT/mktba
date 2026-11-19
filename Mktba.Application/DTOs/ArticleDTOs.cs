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
    }

    /// <summary>Request to move an article to another status; see <c>ArticleStatusTransitions</c>.</summary>
    public class ArticleStatusChangeDto
    {
        public ArticleStatus Status { get; set; }
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
}
