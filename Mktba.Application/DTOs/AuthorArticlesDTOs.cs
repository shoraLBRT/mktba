namespace Mktba.Application.DTOs
{
    /// <summary>One article on an author's public page (P-01, #89).</summary>
    /// <param name="Id">Article id.</param>
    /// <param name="Title">Article title.</param>
    /// <param name="Slug">URL segment of the article: the reader's link is <c>/{slug}</c>.</param>
    /// <param name="Summary">The article's short summary, or null when it has none.</param>
    /// <param name="PublishedAt">When the article first became Published (UTC).</param>
    /// <param name="UpdatedAt">When its content or metadata was last saved (UTC).</param>
    public record AuthorArticleDto(int Id, string Title, string Slug, string? Summary, DateTime PublishedAt, DateTime UpdatedAt);

    /// <summary>
    /// One page of the articles a user wrote or co-authored, as a reader may see them (P-01, #89),
    /// newest publication first.
    /// </summary>
    /// <param name="Total">How many such articles there are in all; may be 0 for a public author.</param>
    /// <param name="Page">The page returned, from 1.</param>
    /// <param name="PageSize">Entries per page.</param>
    /// <param name="Items">The articles of this page.</param>
    public record AuthorArticlesDto(int Total, int Page, int PageSize, List<AuthorArticleDto> Items);
}
