using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs
{
    public class NavigationArticleDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        /// <summary>URL segment of the article: the reader's link is <c>/{slug}</c>.</summary>
        public string Slug { get; set; } = string.Empty;
        /// <summary>The article's language (<c>Locales.Supported</c>); a non-Russian one lives at <c>/{locale}/{slug}</c>.</summary>
        public string Locale { get; set; } = Locales.Default;
        public int? ParentArticleId { get; set; }
        /// <summary>Publication status; anonymous readers only ever see Published.</summary>
        public ArticleStatus Status { get; set; }
        public bool HasContent { get; set; }
        /// <summary>Whether the caller may edit the article: an admin any, an author their own (U-02); false for anonymous readers.</summary>
        public bool CanEdit { get; set; }
        /// <summary>True when the article counts as verified by scholars (V-08, #124: <c>VerifiedArticles</c>); the footer marks such a child.</summary>
        public bool IsVerified { get; set; }
        public List<NavigationArticleDto>? Children { get; set; }
    }
}
