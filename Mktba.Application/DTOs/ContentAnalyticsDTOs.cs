namespace Mktba.Application.DTOs
{
    /// <summary>One Published article in a list of the content analytics (N-07, #101).</summary>
    /// <param name="PublishedAt">When the article first became Published (UTC).</param>
    /// <param name="UpdatedAt">When its content or metadata was last saved (UTC).</param>
    /// <param name="Views">Views over the period.</param>
    /// <param name="Readers">Reader-days over the period (the visitor id changes every UTC day).</param>
    public record ContentArticleDto(
        int ArticleId,
        string Title,
        string Slug,
        DateTime? PublishedAt,
        DateTime UpdatedAt,
        int Views,
        int Readers);

    /// <summary>The first entries of one list and how many there are in all.</summary>
    /// <param name="Total">Every article that matches, listed or not.</param>
    /// <param name="Items">At most fifty of them, in the list's order.</param>
    public record ContentArticleListDto(int Total, IReadOnlyList<ContentArticleDto> Items);

    /// <summary>
    /// A block of opinions (a paragraph with two or more) that gives no opinion of its own for one or
    /// more of the canonical mazhabs: their readers see the block's default opinion.
    /// </summary>
    /// <param name="Position">The block's place among the article's paragraphs, from 1.</param>
    /// <param name="Opinions">How many opinions the block holds.</param>
    /// <param name="MissingSchools">The canonical mazhabs no opinion of the block is linked to, by name.</param>
    /// <param name="MissingSchoolViews">Views of the article over the period by readers who had chosen one of them.</param>
    /// <param name="ArticleViews">Every view of the article over the period.</param>
    public record UncoveredOpinionBlockDto(
        int ArticleId,
        string Title,
        string Slug,
        int ParagraphId,
        int Position,
        int Opinions,
        IReadOnlyList<string> MissingSchools,
        int MissingSchoolViews,
        int ArticleViews);

    /// <summary>The first uncovered blocks and how many there are in all.</summary>
    public record UncoveredOpinionBlockListDto(int Total, IReadOnlyList<UncoveredOpinionBlockDto> Items);

    /// <summary>
    /// The content analytics of the admin dashboard over the last <paramref name="Days"/> UTC days,
    /// today included (N-07, #101): what to write, finish or refresh next. Views come from the daily
    /// summaries (N-04, #98); the articles are taken as they are now, every language and only
    /// Published ones.
    /// </summary>
    /// <param name="From">The first day of the period.</param>
    /// <param name="To">The last day: today (UTC), so far.</param>
    /// <param name="ArticlesWithoutViews">Articles with content, Published before the period began, with no view in it; oldest publication first.</param>
    /// <param name="StubsWithTraffic">Stubs (no text, infobox or summary yet) with views in the period; most views first.</param>
    /// <param name="UncoveredBlocks">Blocks of opinions missing a canonical mazhab; most views by those mazhabs' readers first.</param>
    /// <param name="StaleArticles">Articles with content not saved for <paramref name="StaleAfterDays"/> days; most views first.</param>
    /// <param name="StaleAfterDays">How long an article goes unsaved before it is listed as out of date.</param>
    /// <param name="AggregatedAtUtc">When the latest of these days was last built; null when none was.</param>
    public record ContentAnalyticsDto(
        int Days,
        DateOnly From,
        DateOnly To,
        ContentArticleListDto ArticlesWithoutViews,
        ContentArticleListDto StubsWithTraffic,
        UncoveredOpinionBlockListDto UncoveredBlocks,
        ContentArticleListDto StaleArticles,
        int StaleAfterDays,
        DateTime? AggregatedAtUtc);
}
