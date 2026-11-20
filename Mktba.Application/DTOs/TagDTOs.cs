namespace Mktba.Application.DTOs
{
    /// <summary>
    /// One page of a tag's articles, as a reader may see them (M-06, #70), newest publication first.
    /// The entries are those of an author's page.
    /// </summary>
    /// <param name="Name">The tag's name.</param>
    /// <param name="Slug">The tag's slug; the page is <c>/tags/{slug}</c>.</param>
    /// <param name="Total">How many articles a reader can open carry the tag; at least 1.</param>
    /// <param name="Page">The page returned, from 1.</param>
    /// <param name="PageSize">Entries per page.</param>
    /// <param name="Items">The articles of this page; empty past the last page.</param>
    public record TagPageDto(string Name, string Slug, int Total, int Page, int PageSize, List<AuthorArticleDto> Items);

    /// <summary>A tag in the admin list.</summary>
    /// <param name="Locale">The tag's language; only articles of that language carry it.</param>
    /// <param name="ArticleCount">Articles carrying the tag, whatever their status; 0 for a tag no article carries any more.</param>
    public record TagDto(int Id, string Locale, string Name, string Slug, int ArticleCount);

    /// <summary>A rename of a tag.</summary>
    /// <param name="Name">The new name: the rules of article tags; another tag of the language with this name (in any case) fails with tag_name_taken.</param>
    /// <param name="Slug">The new slug; null or blank keeps the current one. The old slug is not kept: its page answers 404.</param>
    public record TagRenameDto(string Name, string? Slug);

    /// <summary>A merge of one tag into another.</summary>
    /// <param name="IntoTagId">The tag that stays; it must be of the same language and not the merged tag itself.</param>
    public record TagMergeDto(int IntoTagId);
}
