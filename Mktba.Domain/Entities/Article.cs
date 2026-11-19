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
        /// <summary>
        /// Position among the siblings (articles with the same <see cref="ParentArticleId"/>), 0 first.
        /// The tree sorts siblings by Order, then by Id; a move renumbers the siblings 0..N-1.
        /// </summary>
        public int Order { get; set; }
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
        /// <summary>When the article was created (UTC).</summary>
        public DateTime CreatedAt { get; set; }
        /// <summary>When the article's content or metadata was last saved (UTC); equals <see cref="CreatedAt"/> until then.</summary>
        public DateTime UpdatedAt { get; set; }
        /// <summary>
        /// When the article first became Published (UTC). Kept through archiving and re-publishing:
        /// it is the date of first publication, not of the latest one. Null until first published.
        /// </summary>
        public DateTime? PublishedAt { get; set; }
        /// <summary>The user who created the article; null for articles created before authorship was recorded, or whose author was deleted.</summary>
        public int? AuthorId { get; set; }
        public User? Author { get; set; }
        /// <summary>Users credited next to the author; never includes the author.</summary>
        public ICollection<ArticleCoAuthor> CoAuthors { get; set; } = new List<ArticleCoAuthor>();
        /// <summary>Immutable snapshots of every content save, oldest first by <see cref="ArticleRevision.Number"/>.</summary>
        public ICollection<ArticleRevision> Revisions { get; set; } = new List<ArticleRevision>();
        /// <summary>
        /// The revision that was current when the article was last moved to Published; null if never
        /// published. Hook for D4 (#20): once edits to a Published article wait for approval, readers
        /// will be served this revision instead of the working copy.
        /// </summary>
        public int? PublishedRevisionId { get; set; }
        public ArticleRevision? PublishedRevision { get; set; }
    }
}
