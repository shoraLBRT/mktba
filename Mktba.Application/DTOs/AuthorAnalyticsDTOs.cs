namespace Mktba.Application.DTOs
{
    /// <summary>One UTC day of the signed-in author's statistics (P-03, #91).</summary>
    /// <param name="Day">The UTC calendar day.</param>
    /// <param name="Views">Views of the author's articles, bots and repeats left out (N-03).</param>
    /// <param name="Readers">Distinct visitors who viewed any of the author's articles that day.</param>
    public record AuthorAnalyticsDayDto(DateOnly Day, int Views, int Readers);

    /// <summary>The period's days added up.</summary>
    /// <param name="Readers">Reader-days: the visitor id changes every UTC day, so one person on three days counts three times.</param>
    /// <param name="ArticlesViewed">How many of the author's current articles were viewed at least once in the period.</param>
    public record AuthorAnalyticsTotalsDto(int Views, int Readers, int ArticlesViewed);

    /// <summary>How far the views got: of <paramref name="Views"/>, how many reached a quarter, half, three quarters and the end of the text.</summary>
    public record ReadDepthDto(int Views, int ReachedDepth25, int ReachedDepth50, int ReachedDepth75, int ReachedDepth100);

    /// <summary>One of the author's articles over the period.</summary>
    /// <param name="Readers">Reader-days, as <see cref="AuthorAnalyticsTotalsDto.Readers"/>.</param>
    /// <param name="Depth">How far its views got.</param>
    public record AuthorArticleTotalDto(int ArticleId, string Title, string Slug, int Views, int Readers, ReadDepthDto Depth);

    /// <summary>
    /// The signed-in author's statistics over the last <paramref name="Days"/> UTC days, today included
    /// (P-03, #91), read from the daily summaries (N-04, #98). Only articles the user writes or
    /// co-writes now are listed.
    /// </summary>
    /// <param name="From">The first day of the period.</param>
    /// <param name="To">The last day: today (UTC), so far.</param>
    /// <param name="Daily">
    /// Every day of the period, oldest first, zeros for a day without views: the author's summary of the
    /// day, which counts the articles the user wrote or co-wrote on that day.
    /// </param>
    /// <param name="TopArticles">The author's most viewed articles, most views first, at most ten.</param>
    /// <param name="Depth">How far the views of all the author's articles got.</param>
    /// <param name="Schools">The views of the author's articles by the mazhab the reader had chosen, most views first.</param>
    /// <param name="ViewsWithoutSchool">Views of the author's articles by readers who had not chosen a mazhab.</param>
    /// <param name="AggregatedAtUtc">When the latest of these days was last built; null when none was.</param>
    public record AuthorAnalyticsDto(
        int Days,
        DateOnly From,
        DateOnly To,
        AuthorAnalyticsTotalsDto Totals,
        IReadOnlyList<AuthorAnalyticsDayDto> Daily,
        IReadOnlyList<AuthorArticleTotalDto> TopArticles,
        ReadDepthDto Depth,
        IReadOnlyList<AnalyticsSchoolTotalDto> Schools,
        int ViewsWithoutSchool,
        DateTime? AggregatedAtUtc);
}
