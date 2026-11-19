namespace Mktba.Application.DTOs
{
    /// <summary>
    /// One article the sitemap lists (O-06, #57): Published, not marked noindex, and not under a
    /// parent hidden from readers. Its translations are the other entries with the same
    /// <see cref="TranslationGroupId"/>.
    /// </summary>
    /// <param name="Slug">URL segment of the article within its <paramref name="Locale"/>.</param>
    /// <param name="Locale">Language of the article (D6, #21), e.g. <c>ru</c>.</param>
    /// <param name="TranslationGroupId">Shared by every language version of one text.</param>
    /// <param name="LastModified">When the article was last saved (UTC): the sitemap's <c>lastmod</c>.</param>
    public record SitemapArticleDto(string Slug, string Locale, Guid TranslationGroupId, DateTime LastModified);
}
