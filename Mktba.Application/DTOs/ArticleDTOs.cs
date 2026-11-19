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
        /// <summary>Publication status; anonymous readers only ever see Published.</summary>
        public ArticleStatus Status { get; set; }
        /// <summary>Statuses the article may move to next, from <c>ArticleStatusTransitions</c>.</summary>
        public List<ArticleStatus> AllowedTransitions { get; set; } = new();
        public bool HasContent { get; set; }
    }

    /// <summary>Request to move an article to another status; see <c>ArticleStatusTransitions</c>.</summary>
    public class ArticleStatusChangeDto
    {
        public ArticleStatus Status { get; set; }
    }

    public class ArticleCreateDto
    {
        public string Title { get; set; } = string.Empty;
        public int? ParentArticleId { get; set; }
    }

    public class ArticleUpdateDto
    {
        public string Title { get; set; } = string.Empty;
        public int? ParentArticleId { get; set; }
    }
}
