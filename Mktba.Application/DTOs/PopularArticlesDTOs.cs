namespace Mktba.Application.DTOs
{
    /// <summary>One entry of the home page's list of popular articles (R-05, #41).</summary>
    /// <param name="Id">Article id.</param>
    /// <param name="Title">Article title.</param>
    /// <param name="Slug">URL segment of the article: the reader's link is <c>/{slug}</c>.</param>
    /// <param name="Summary">The article's short summary, or null when it has none.</param>
    /// <param name="IsVerified">True when the article counts as verified by scholars (V-08, #124: <c>VerifiedArticles</c>).</param>
    public record PopularArticleDto(int Id, string Title, string Slug, string? Summary, bool IsVerified);

    /// <summary>
    /// The articles a reader can open that were viewed most over the last <see cref="Days"/> UTC days,
    /// today included (R-05, #41). The view counts stay on the admin dashboards: the list gives only the order.
    /// </summary>
    /// <param name="Days">Length of the period the views were counted over.</param>
    /// <param name="Items">Most views first; an article with no view in the period is not listed.</param>
    public record PopularArticlesDto(int Days, List<PopularArticleDto> Items);
}
