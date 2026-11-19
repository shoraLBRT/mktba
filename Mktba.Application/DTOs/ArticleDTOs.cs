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
}
