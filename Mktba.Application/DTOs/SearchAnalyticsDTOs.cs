namespace Mktba.Application.DTOs
{
    /// <summary>The period's searches added up (N-06, #100), every query included, shown or not.</summary>
    /// <param name="Searches">Searches submitted.</param>
    /// <param name="SearchesWithoutResults">Of them, those that found no article.</param>
    public record SearchAnalyticsTotalsDto(int Searches, int SearchesWithoutResults);

    /// <summary>One query over the period, counted only on the days enough visitors made it.</summary>
    /// <param name="Query">The query in lower case.</param>
    /// <param name="Searchers">Searcher-days: the visitor id changes every UTC day, so one person on three days counts three times.</param>
    /// <param name="SearchesWithoutResults">Of <paramref name="Searches"/>, those that found no article.</param>
    public record SearchQueryTotalDto(string Query, int Searches, int Searchers, int SearchesWithoutResults);

    /// <summary>
    /// The search analytics of the admin dashboard over the last <paramref name="Days"/> UTC days, today
    /// included (N-06, #100), read from the daily summaries (N-04, #98).
    /// </summary>
    /// <param name="From">The first day of the period.</param>
    /// <param name="To">The last day: today (UTC), so far.</param>
    /// <param name="TopQueries">The most searched queries, most searches first, at most twenty.</param>
    /// <param name="QueriesWithoutResults">Queries that found nothing at least once, most such searches first, at most twenty.</param>
    /// <param name="MinSearchers">A query is listed for a day only when at least this many distinct visitors made it that day.</param>
    /// <param name="AggregatedAtUtc">When the latest of these days was last built; null when none was.</param>
    public record SearchAnalyticsDto(
        int Days,
        DateOnly From,
        DateOnly To,
        SearchAnalyticsTotalsDto Totals,
        IReadOnlyList<SearchQueryTotalDto> TopQueries,
        IReadOnlyList<SearchQueryTotalDto> QueriesWithoutResults,
        int MinSearchers,
        DateTime? AggregatedAtUtc);
}
