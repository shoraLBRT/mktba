namespace Mktba.Application.Configuration;

/// <summary>The <c>Analytics</c> configuration section: daily summaries and how long raw events are kept (N-04, #98).</summary>
public sealed class AnalyticsOptions
{
    public const string SectionName = "Analytics";

    /// <summary>
    /// How many days raw events are kept, counted back from today (UTC). Older ones are removed, but
    /// only once their day is aggregated for good, so a summary is never lost with them. 0 or less:
    /// raw events are kept for ever.
    /// </summary>
    public int RetentionDays { get; set; } = 180;

    /// <summary>How often the summaries are rebuilt, in minutes: today's numbers lag by at most this.</summary>
    public int AggregationIntervalMinutes { get; set; } = 60;

    /// <summary>
    /// k-anonymity of search phrases (N-06, #100): a query is shown on the dashboard, and kept in the
    /// summary of a final day, only when at least this many distinct visitors made it that day.
    /// Values below 1 count as 1. A final day is never rebuilt, so a change applies only to days not
    /// final yet.
    /// </summary>
    public int SearchQueryMinSearchers { get; set; } = 2;

    public int MinSearchers => Math.Max(1, SearchQueryMinSearchers);

    /// <summary>
    /// How many distinct search queries of one <c>POST /analytics/events</c> request get their results
    /// counted with the site's search (N-06, #100); the others are stored with no count. The endpoint
    /// is public, so this keeps it from running the search more often than a reader could. 0 or less:
    /// nothing is counted.
    /// </summary>
    public int MaxSearchCountsPerRequest { get; set; } = 3;

    /// <summary>
    /// Content analytics (N-07, #101): a Published article not saved for this many days is listed as
    /// out of date. Values below 1 count as 1.
    /// </summary>
    public int StaleArticleDays { get; set; } = 365;

    public int StaleAfterDays => Math.Max(1, StaleArticleDays);

    public TimeSpan AggregationInterval => TimeSpan.FromMinutes(Math.Max(1, AggregationIntervalMinutes));
}
