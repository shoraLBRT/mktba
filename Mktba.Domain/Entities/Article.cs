namespace Mktba.Domain.Entities
{
    public class Article
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        /// <summary>
        /// URL segment of the article: lowercase Latin letters, digits and single hyphens, never
        /// only digits. Unique across all articles for now; becomes unique per language with M-09 (#27).
        /// </summary>
        public string Slug { get; set; } = string.Empty;
        /// <summary>Publication status; new articles start as <see cref="ArticleStatus.Draft"/>.</summary>
        public ArticleStatus Status { get; set; } = ArticleStatus.Draft;
        public string? InfoboxTitle { get; set; }
        public string? InfoboxSubtitle { get; set; }
        public int? ParentArticleId { get; set; }
        public Article? ParentArticle { get; set; }
        public ICollection<Article> ChildArticles { get; set; } = new List<Article>();
        public ICollection<Paragraph> Paragraphs { get; set; } = new List<Paragraph>();
        public ICollection<ArticleInfoboxField> InfoboxFields { get; set; } = new List<ArticleInfoboxField>();
        public string? Summary { get; set; }
        public string? Tags { get; set; }
        public ICollection<ArticleRelatedLink> RelatedLinks { get; set; } = new List<ArticleRelatedLink>();
        /// <summary>Кастомные школы, созданные редактором только для этой статьи</summary>
        public ICollection<School> CustomSchools { get; set; } = new List<School>();
        /// <summary>Slugs the article used before; requests for them redirect to <see cref="Slug"/>.</summary>
        public ICollection<ArticleSlugRedirect> SlugRedirects { get; set; } = new List<ArticleSlugRedirect>();
    }
}
