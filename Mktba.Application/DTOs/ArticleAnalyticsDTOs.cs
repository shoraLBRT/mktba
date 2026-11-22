namespace Mktba.Application.DTOs
{
    /// <summary>One UTC day of one article's statistics (N-09, #103).</summary>
    /// <param name="Day">The UTC calendar day.</param>
    /// <param name="Views">Views of the article, bots and repeats left out (N-03).</param>
    /// <param name="Readers">Distinct visitors who viewed it that day.</param>
    /// <param name="OpinionSwitches">Times readers switched to another opinion of a block.</param>
    /// <param name="InternalLinkClicks">Links followed from the article to another page of the site.</param>
    public record ArticleAnalyticsDayDto(DateOnly Day, int Views, int Readers, int OpinionSwitches, int InternalLinkClicks);

    /// <summary>The period's days of one article added up.</summary>
    /// <param name="Readers">Reader-days: the visitor id changes every UTC day, so one person on three days counts three times.</param>
    /// <param name="OpinionsShown">Blocks of opinions that came into view (once per block and page view).</param>
    public record ArticleAnalyticsTotalsDto(int Views, int Readers, int OpinionsShown, int OpinionSwitches, int InternalLinkClicks);

    /// <summary>
    /// One article's statistics over the last <paramref name="Days"/> UTC days, today included
    /// (N-09, #103), read from the daily summaries (N-04, #98). Only an admin or the article's author
    /// or co-author may read them.
    /// </summary>
    /// <param name="Title">The article's title now.</param>
    /// <param name="Slug">The article's address now.</param>
    /// <param name="From">The first day of the period.</param>
    /// <param name="To">The last day: today (UTC) unless a range was asked for.</param>
    /// <param name="Daily">Every day of the period, oldest first, zeros for a day without views.</param>
    /// <param name="Depth">How far the views got.</param>
    /// <param name="Schools">The views by the mazhab the reader had chosen, most views first.</param>
    /// <param name="ViewsWithoutSchool">Views by readers who had not chosen a mazhab.</param>
    /// <param name="AggregatedAtUtc">When the latest of these days was last built; null when none was.</param>
    /// <param name="Previous">The totals of the period of the same length just before (N-08, #102).</param>
    public record ArticleAnalyticsDto(
        int ArticleId,
        string Title,
        string Slug,
        int Days,
        DateOnly From,
        DateOnly To,
        ArticleAnalyticsTotalsDto Totals,
        IReadOnlyList<ArticleAnalyticsDayDto> Daily,
        ReadDepthDto Depth,
        IReadOnlyList<AnalyticsSchoolTotalDto> Schools,
        int ViewsWithoutSchool,
        DateTime? AggregatedAtUtc,
        AnalyticsPreviousPeriodDto<ArticleAnalyticsTotalsDto> Previous);
}
