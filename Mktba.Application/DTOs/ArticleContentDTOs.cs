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

    /// <param name="Slug">Optional URL segment; null or blank generates one from the title.</param>
    public record ArticleContentCreateDto(
        string Title,
        int? ParentArticleId,
        List<ParagraphCreateDto> Paragraphs,
        ArticleInfoboxCreateDto? Infobox,
        string? Summary,
        List<string>? Tags,
        List<ArticleRelatedLinkCreateDto>? RelatedLinks,
        string? Slug = null
    );

    /// <param name="Slug">
    /// The article's URL segment. Always set on read. On update, null or blank keeps the current
    /// slug; a new value is validated, and the old slug keeps working as a redirect.
    /// </param>
    /// <param name="PublishedAt">Read only: when the article was first published (UTC), null if never. Ignored on update.</param>
    /// <param name="UpdatedAt">Read only: when the article was last saved (UTC). Ignored on update.</param>
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
        DateTime? UpdatedAt = null
    );

    /// <summary>
    /// Result of looking an article up by slug: either its content (the slug is current) or the
    /// current slug to redirect to (the slug is an old one).
    /// </summary>
    public record ArticleSlugLookup(ArticleContentDto? Content, string? RedirectToSlug);
}
