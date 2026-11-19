using System.Text.RegularExpressions;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Application.Services
{
    /// <summary>Validates, stores and resolves an article's SEO fields (M-10, #28).</summary>
    internal static partial class ArticleSeo
    {
        /// <summary>Length of the description cut from the article text when there is no SEO description or summary.</summary>
        public const int ExcerptMaxLength = MktbaDbContext.SeoDescriptionMaxLength;

        /// <summary>The overrides with blanks turned into null and strings trimmed; null input means no overrides.</summary>
        public static ArticleSeoDto Normalize(ArticleSeoDto? seo)
            => new(Trimmed(seo?.Title), Trimmed(seo?.Description), Trimmed(seo?.SocialImageUrl), seo?.NoIndex ?? false);

        /// <summary>The first rule a normalized value breaks, or null when it is valid.</summary>
        public static AppError? Check(ArticleSeoDto seo)
        {
            if (seo.Title?.Length > MktbaDbContext.SeoTitleMaxLength) return AppErrors.ArticleSeoTitleTooLong;
            if (seo.Description?.Length > MktbaDbContext.SeoDescriptionMaxLength) return AppErrors.ArticleSeoDescriptionTooLong;
            if (seo.SocialImageUrl is { } url && !IsValidImageUrl(url)) return AppErrors.ArticleSocialImageUrlInvalid;
            return null;
        }

        /// <summary>An absolute http(s) URL, or a site-relative path ("/x", not "//host").</summary>
        public static bool IsValidImageUrl(string url)
        {
            if (url.Length > MktbaDbContext.SocialImageUrlMaxLength || url.Any(char.IsWhiteSpace)) return false;
            if (url.StartsWith('/')) return !url.StartsWith("//") && !url.Contains('\\');
            return Uri.TryCreate(url, UriKind.Absolute, out var uri)
                && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
                && !string.IsNullOrEmpty(uri.Host);
        }

        public static void Apply(Article article, ArticleSeoDto seo)
        {
            article.SeoTitle = seo.Title;
            article.SeoDescription = seo.Description;
            article.SocialImageUrl = seo.SocialImageUrl;
            article.NoIndex = seo.NoIndex;
        }

        public static ArticleSeoDto From(Article article)
            => new(article.SeoTitle, article.SeoDescription, article.SocialImageUrl, article.NoIndex);

        /// <summary>
        /// The effective metadata: SEO title → title; SEO description → summary → excerpt of the first
        /// paragraph. Noindex when marked so, when not Published, or when the article is a stub.
        /// </summary>
        public static ArticleMetaDto Resolve(Article article)
            => new(
                article.SeoTitle ?? article.Title,
                article.SeoDescription ?? NullIfBlank(article.Summary) ?? Excerpt(FirstParagraphText(article)),
                article.SocialImageUrl,
                article.NoIndex || article.Status != ArticleStatus.Published || IsStub(article));

        /// <summary>
        /// A stub: no opinion, infobox or summary yet — the rule behind <c>hasContent</c> in the
        /// article list. Expects paragraphs, opinions and infobox fields loaded.
        /// </summary>
        public static bool IsStub(Article article)
            => !article.Paragraphs.Any(paragraph => paragraph.Opinions.Any())
                && !article.InfoboxFields.Any()
                && string.IsNullOrWhiteSpace(article.InfoboxTitle)
                && string.IsNullOrWhiteSpace(article.InfoboxSubtitle)
                && string.IsNullOrWhiteSpace(article.Summary);

        /// <summary>
        /// Plain text of Markdown/HTML, whitespace collapsed, cut on a word boundary to
        /// <see cref="ExcerptMaxLength"/> characters with an ellipsis; null when nothing is left.
        /// </summary>
        public static string? Excerpt(string? markdown)
        {
            if (string.IsNullOrWhiteSpace(markdown)) return null;
            var text = ImageRegex().Replace(markdown, " ");
            text = LinkRegex().Replace(text, "$1");
            text = HtmlTagRegex().Replace(text, " ");
            text = MarkupRegex().Replace(text, " ");
            text = WhitespaceRegex().Replace(text, " ").Trim();
            if (text.Length == 0) return null;
            if (text.Length <= ExcerptMaxLength) return text;

            var cut = text[..(ExcerptMaxLength - 1)];
            var lastSpace = cut.LastIndexOf(' ');
            if (lastSpace > ExcerptMaxLength / 2) cut = cut[..lastSpace];
            return cut.TrimEnd(' ', ',', ';', ':', '.', '-', '—') + "…";
        }

        private static string? FirstParagraphText(Article article)
        {
            var first = article.Paragraphs.OrderBy(p => p.Order).FirstOrDefault();
            var opinion = first?.Opinions.FirstOrDefault(o => o.IsDefault) ?? first?.Opinions.OrderBy(o => o.Id).FirstOrDefault();
            return opinion?.Content;
        }

        private static string? Trimmed(string? value) => NullIfBlank(value)?.Trim();

        private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;

        [GeneratedRegex(@"!\[[^\]]*\]\([^)]*\)")]
        private static partial Regex ImageRegex();

        [GeneratedRegex(@"\[([^\]]*)\]\([^)]*\)")]
        private static partial Regex LinkRegex();

        [GeneratedRegex(@"<[^>]+>")]
        private static partial Regex HtmlTagRegex();

        [GeneratedRegex(@"[#*_>`~|]+")]
        private static partial Regex MarkupRegex();

        [GeneratedRegex(@"\s+")]
        private static partial Regex WhitespaceRegex();
    }
}
