namespace Mktba.Application.DTOs
{
    /// <summary>One entry of the home page's lists of new and updated articles (R-05, #41).</summary>
    /// <param name="Id">Article id.</param>
    /// <param name="Title">Article title.</param>
    /// <param name="Slug">URL segment of the article: the reader's link is <c>/{slug}</c>.</param>
    /// <param name="Summary">The article's short summary, or null when it has none.</param>
    /// <param name="PublishedAt">When the article first became Published (UTC).</param>
    /// <param name="UpdatedAt">When its content or metadata was last saved (UTC).</param>
    /// <param name="IsVerified">True when the article counts as verified by scholars (V-08, #124: <c>VerifiedArticles</c>).</param>
    public record RecentArticleDto(int Id, string Title, string Slug, string? Summary, DateTime PublishedAt, DateTime UpdatedAt, bool IsVerified);

    /// <summary>
    /// The newest and the most recently updated articles a reader can open (R-05, #41). An article
    /// may appear in both lists.
    /// </summary>
    /// <param name="New">Ordered by <see cref="RecentArticleDto.PublishedAt"/>, newest first.</param>
    /// <param name="Updated">
    /// Articles saved after they were published, ordered by <see cref="RecentArticleDto.UpdatedAt"/>,
    /// latest first.
    /// </param>
    public record RecentArticlesDto(List<RecentArticleDto> New, List<RecentArticleDto> Updated);
}
