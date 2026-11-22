namespace Mktba.Domain.Entities
{
    public class Article
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        /// <summary>
        /// URL segment of the article: lowercase Latin letters, digits and single hyphens, never
        /// only digits. Unique within the article's <see cref="Locale"/>, together with the old slugs
        /// kept as redirects; a translation may reuse the original's slug.
        /// </summary>
        public string Slug { get; set; } = string.Empty;
        /// <summary>
        /// Language of the article, one of <see cref="Locales.Supported"/>. Set when the article is
        /// created and never changed: a translation is a separate article (D6, #21).
        /// </summary>
        public string Locale { get; set; } = Locales.Default;
        /// <summary>
        /// Links an article with its translations: all language versions of one text share the id,
        /// and a group holds at most one article per <see cref="Locale"/>. A new article starts its own group.
        /// </summary>
        public Guid TranslationGroupId { get; set; } = Guid.NewGuid();
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
        /// <summary>The article's tags (M-06, #70), ordered by <see cref="ArticleTag.Order"/>.</summary>
        public ICollection<ArticleTag> TagLinks { get; set; } = new List<ArticleTag>();
        /// <summary>
        /// Copy of the tag names joined by ",", in order (column <c>Tags</c>), kept only for the full-text
        /// search: the stored generated <c>SearchVector</c> column can read only this table. Written
        /// together with <see cref="TagLinks"/> and never read for anything else; null when there are none.
        /// </summary>
        public string? TagsSearchText { get; set; }
        /// <summary>Title for search engines and link previews; null falls back to <see cref="Title"/>.</summary>
        public string? SeoTitle { get; set; }
        /// <summary>Description for search engines and link previews; null falls back to <see cref="Summary"/>, then to the start of the text.</summary>
        public string? SeoDescription { get; set; }
        /// <summary>Image for link previews (og:image): an absolute http(s) URL or a site-relative path; null means none.</summary>
        public string? SocialImageUrl { get; set; }
        /// <summary>True asks search engines not to index the article (robots noindex).</summary>
        public bool NoIndex { get; set; }
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
        /// <summary>
        /// When the article was moved to the trash (UTC); null while it is in use (M-11, #133). A trashed
        /// article is hidden from every query by a global filter, keeps its slug, content, revisions and
        /// files, and can be restored or purged by an admin.
        /// </summary>
        public DateTime? DeletedAt { get; set; }
        /// <summary>The user who moved the article to the trash; null when not trashed or that user was deleted.</summary>
        public int? DeletedById { get; set; }
        public User? DeletedBy { get; set; }
    }
}
