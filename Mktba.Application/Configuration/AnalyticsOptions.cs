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

    public TimeSpan AggregationInterval => TimeSpan.FromMinutes(Math.Max(1, AggregationIntervalMinutes));
}
