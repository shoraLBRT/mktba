using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs
{
    public class NavigationArticleDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        /// <summary>URL segment of the article: the reader's link is <c>/{slug}</c>.</summary>
        public string Slug { get; set; } = string.Empty;
        public int? ParentArticleId { get; set; }
        /// <summary>Publication status; anonymous readers only ever see Published.</summary>
        public ArticleStatus Status { get; set; }
        public bool HasContent { get; set; }
        /// <summary>Whether the caller may edit the article: an admin any, an author their own (U-02); false for anonymous readers.</summary>
        public bool CanEdit { get; set; }
        public List<NavigationArticleDto>? Children { get; set; }
    }
}
