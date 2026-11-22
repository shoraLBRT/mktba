namespace Mktba.Application.DTOs
{
    /// <summary>One UTC day of the site's own statistics (N-05, #99).</summary>
    /// <param name="Day">The UTC calendar day.</param>
    /// <param name="ArticleViews">Article page views, bots and repeats left out (N-03).</param>
    /// <param name="Visitors">Distinct visitors who sent anything that day.</param>
    /// <param name="Searches">Searches submitted.</param>
    public record SiteAnalyticsDayDto(DateOnly Day, int ArticleViews, int Visitors, int Searches);

    /// <summary>The period's days added up.</summary>
    /// <param name="Visitors">Visitor-days: the visitor id changes every UTC day, so one person on three days counts three times.</param>
    public record SiteAnalyticsTotalsDto(int ArticleViews, int Visitors, int Searches);

    /// <summary>An article's views over the period.</summary>
    /// <param name="Title">Null when the article has been deleted since.</param>
    /// <param name="Slug">Null when the article has been deleted since.</param>
    /// <param name="Readers">Reader-days, as <see cref="SiteAnalyticsTotalsDto.Visitors"/>.</param>
    public record AnalyticsArticleTotalDto(int ArticleId, string? Title, string? Slug, int Views, int Readers);

    /// <summary>The article views of readers who had chosen one mazhab.</summary>
    /// <param name="Name">Null when the school has been deleted since.</param>
    /// <param name="Readers">Reader-days, as <see cref="SiteAnalyticsTotalsDto.Visitors"/>.</param>
    public record AnalyticsSchoolTotalDto(int SchoolId, string? Name, int Views, int Readers);

    /// <summary>
    /// The admin dashboard's statistics over the last <paramref name="Days"/> UTC days, today included
    /// (N-05, #99), read from the daily summaries (N-04, #98).
    /// </summary>
    /// <param name="From">The first day of the period.</param>
    /// <param name="To">The last day: today (UTC), so far.</param>
    /// <param name="Daily">Every day of the period, oldest first, zeros for a day without events.</param>
    /// <param name="TopArticles">The most viewed articles, most views first, at most ten.</param>
    /// <param name="Schools">Article views by the mazhab the reader had chosen, most views first.</param>
    /// <param name="ViewsWithoutSchool">Article views of readers who had not chosen a mazhab.</param>
    /// <param name="AggregatedAtUtc">When the latest of these days was last built; null when none was.</param>
    public record SiteAnalyticsDto(
        int Days,
        DateOnly From,
        DateOnly To,
        SiteAnalyticsTotalsDto Totals,
        IReadOnlyList<SiteAnalyticsDayDto> Daily,
        IReadOnlyList<AnalyticsArticleTotalDto> TopArticles,
        IReadOnlyList<AnalyticsSchoolTotalDto> Schools,
        int ViewsWithoutSchool,
        DateTime? AggregatedAtUtc);
}
