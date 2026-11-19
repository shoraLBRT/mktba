namespace Mktba.Application.DTOs
{
    public record ArticleInfoboxFieldCreateDto(
        int Order,
        string Key,
        string Label,
        string Value
    );

    public record ArticleInfoboxCreateDto(
        string? Title,
        string? Subtitle,
        List<ArticleInfoboxFieldCreateDto> Fields
    );

    public record ArticleInfoboxFieldDto(
        int Id,
        int Order,
        string Key,
        string Label,
        string Value
    );

    public record ArticleInfoboxDto(
        string? Title,
        string? Subtitle,
        List<ArticleInfoboxFieldDto> Fields
    );

    public record ArticleRelatedLinkCreateDto(
        int RelatedArticleId,
        int Order
    );

    /// <param name="RelatedArticleSlug">Current slug of the related article; ignored on update.</param>
    public record ArticleRelatedLinkDto(
        int Id,
        int RelatedArticleId,
        string RelatedArticleTitle,
        int Order,
        string RelatedArticleSlug = ""
    );

    /// <summary>
    /// SEO overrides of an article as the editor set them. Blank strings are stored as null; null
    /// means "use the fallback" (see <see cref="ArticleMetaDto"/>).
    /// </summary>
    /// <param name="Title">Title for search engines and link previews, at most 70 characters (article_seo_title_too_long).</param>
    /// <param name="Description">Description for search engines and link previews, at most 160 characters (article_seo_description_too_long).</param>
    /// <param name="SocialImageUrl">
    /// Image for link previews (og:image): an absolute http or https URL, or a site-relative path
    /// starting with a single "/"; at most 2048 characters. Anything else fails with article_social_image_url_invalid.
    /// </param>
    /// <param name="NoIndex">True asks search engines not to index the article.</param>
    public record ArticleSeoDto(
        string? Title,
        string? Description,
        string? SocialImageUrl,
        bool NoIndex
    );

    /// <summary>
    /// Read only: the page metadata a reader's page uses, with the fallbacks applied.
    /// </summary>
    /// <param name="Title">The SEO title, else the article title.</param>
    /// <param name="Description">
    /// The SEO description, else the summary, else the plain text of the first paragraph's default
    /// opinion cut to 160 characters; null when the article has none of them.
    /// </param>
    /// <param name="SocialImageUrl">The social image URL as stored, or null.</param>
    /// <param name="NoIndex">
    /// True when the page must carry robots noindex: the article is marked noindex, is not Published
    /// (an editor viewing a draft), or is a stub with no content yet (O-07).
    /// </param>
    public record ArticleMetaDto(
        string Title,
        string? Description,
        string? SocialImageUrl,
        bool NoIndex
    );

    /// <param name="Slug">Optional URL segment; null or blank generates one from the title.</param>
    /// <param name="Seo">Optional SEO overrides; null means none.</param>
    /// <param name="EditComment">Optional note stored on the first revision (at most 500 characters).</param>
    /// <param name="Locale">
    /// Language of the new article: a supported code such as "ru" or "en"; null or blank means "ru".
    /// Fixed once the article exists. An unsupported code fails with locale_unsupported.
    /// </param>
    public record ArticleContentCreateDto(
        string Title,
        int? ParentArticleId,
        List<ParagraphCreateDto> Paragraphs,
        ArticleInfoboxCreateDto? Infobox,
        string? Summary,
        List<string>? Tags,
        List<ArticleRelatedLinkCreateDto>? RelatedLinks,
        string? Slug = null,
        string? EditComment = null,
        string? Locale = null,
        ArticleSeoDto? Seo = null
    );

    /// <param name="Slug">
    /// The article's URL segment. Always set on read. On update, null or blank keeps the current
    /// slug; a new value is validated, and the old slug keeps working as a redirect.
    /// </param>
    /// <param name="PublishedAt">Read only: when the article was first published (UTC), null if never. Ignored on update.</param>
    /// <param name="UpdatedAt">Read only: when the article was last saved (UTC). Ignored on update.</param>
    /// <param name="EditComment">Write only: optional note stored on the revision this update creates (at most 500 characters). Always null on read.</param>
    /// <param name="Locale">Read only: the article's language code ("ru", "en"); the slug is unique within it. Ignored on update.</param>
    /// <param name="TranslationGroupId">Read only: shared by an article and its translations. Ignored on update.</param>
    /// <param name="Seo">
    /// The SEO overrides. Always set on read. On update it replaces them like the other fields:
    /// null clears every override and the noindex flag.
    /// </param>
    /// <param name="Meta">Read only: effective page metadata with the fallbacks applied. Ignored on update.</param>
    /// <param name="Sources">
    /// Read only: the directory entries the opinions of the article cite (<c>opinions[].sources[].sourceId</c>),
    /// each once, in the order they are first cited. Always set on read. Ignored on update: citations
    /// are written on the opinions, entries through <c>/sources</c>.
    /// </param>
    public record ArticleContentDto(
        int Id,
        string Title,
        List<ParagraphDto> Paragraphs,
        ArticleInfoboxDto? Infobox,
        string? Summary,
        List<string> Tags,
        List<ArticleRelatedLinkDto>? RelatedLinks,
        string? Slug = null,
        DateTime? PublishedAt = null,
        DateTime? UpdatedAt = null,
        string? EditComment = null,
        string? Locale = null,
        Guid? TranslationGroupId = null,
        ArticleSeoDto? Seo = null,
        ArticleMetaDto? Meta = null,
        List<SourceDto>? Sources = null
    );

    /// <summary>
    /// Result of looking an article up by slug: either its content (the slug is current) or the
    /// current slug to redirect to (the slug is an old one).
    /// </summary>
    public record ArticleSlugLookup(ArticleContentDto? Content, string? RedirectToSlug);
}
