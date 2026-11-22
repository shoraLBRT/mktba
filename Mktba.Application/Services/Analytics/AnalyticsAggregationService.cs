using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services.Analytics;

/// <summary>What one aggregation run did.</summary>
/// <param name="DaysAggregated">Days whose summaries were rebuilt (today included).</param>
/// <param name="EventsRemoved">Raw events removed by the retention.</param>
public sealed record AnalyticsAggregationRun(int DaysAggregated, int EventsRemoved);

/// <summary>
/// Builds the daily summaries of the own analytics events (N-04, #98) and cuts the raw log back.
/// <para>
/// A run rebuilds every day from the one after the last final day (or the day of the oldest event,
/// the first time) through today, oldest first. A day is always rebuilt as a whole — its rows are
/// replaced, never added to — so running again changes nothing that the events do not. A day that
/// ended at least <see cref="SettleTime"/> before the run becomes final: events are stamped with the
/// server's clock on arrival, so no more can come for it, and it is never rebuilt again. Today, and
/// a day that ended moments ago, are rebuilt on every run until then, which is how today's numbers
/// stay current.
/// </para>
/// <para>
/// Authors and tags are taken from the articles as they are when the day is built, so a final day
/// keeps the authorship of the time it closed.
/// </para>
/// <para>
/// Search phrases (N-06, #100): a final day keeps a query only when at least
/// <see cref="AnalyticsOptions.SearchQueryMinSearchers"/> distinct visitors made it that day.
/// </para>
/// <para>
/// Retention: raw events older than <see cref="AnalyticsOptions.RetentionDays"/> days are removed,
/// but never those of a day that is not final yet.
/// </para>
/// </summary>
public class AnalyticsAggregationService
{
    /// <summary>How long after a day ends it is still rebuilt, for events received at midnight and committed after.</summary>
    public static readonly TimeSpan SettleTime = TimeSpan.FromMinutes(10);

    private readonly AnalyticsSummaryRepository _summaries;
    private readonly TimeProvider _timeProvider;
    private readonly AnalyticsOptions _options;

    public AnalyticsAggregationService(AnalyticsSummaryRepository summaries, TimeProvider timeProvider, IOptions<AnalyticsOptions> options)
    {
        _summaries = summaries;
        _timeProvider = timeProvider;
        _options = options.Value;
    }

    public async Task<AnalyticsAggregationRun> RunAsync(CancellationToken cancellationToken = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var today = DateOnly.FromDateTime(now);

        var lastFinal = await _summaries.GetLastFinalDayAsync(cancellationToken);
        DateOnly? first = lastFinal?.AddDays(1);
        if (first is null && await _summaries.GetFirstEventTimeAsync(cancellationToken) is { } firstEvent)
        {
            first = DateOnly.FromDateTime(firstEvent);
        }

        var days = 0;
        for (var day = first; day is { } current && current <= today; day = current.AddDays(1))
        {
            await AggregateDayAsync(current, now, cancellationToken);
            days++;
        }

        var removed = await ApplyRetentionAsync(today, cancellationToken);
        return new AnalyticsAggregationRun(days, removed);
    }

    private async Task AggregateDayAsync(DateOnly day, DateTime now, CancellationToken cancellationToken)
    {
        var start = day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var end = start.AddDays(1);

        var accumulator = new AnalyticsDayAccumulator(day);
        await foreach (var e in _summaries.StreamEventsAsync(start, end).WithCancellation(cancellationToken))
        {
            accumulator.Add(e);
        }

        var attributions = await _summaries.GetAttributionsAsync(accumulator.ArticleIds.ToList(), cancellationToken);
        var isFinal = now >= end + SettleTime;
        await _summaries.ReplaceDayAsync(accumulator.Build(attributions, isFinal, now, _options.MinSearchers), cancellationToken);
    }

    private async Task<int> ApplyRetentionAsync(DateOnly today, CancellationToken cancellationToken)
    {
        if (_options.RetentionDays <= 0 || await _summaries.GetLastFinalDayAsync(cancellationToken) is not { } lastFinal)
        {
            return 0;
        }

        var keepFrom = today.AddDays(-_options.RetentionDays);
        var firstNotFinal = lastFinal.AddDays(1);
        var cutoff = keepFrom < firstNotFinal ? keepFrom : firstNotFinal;
        return await _summaries.DeleteEventsBeforeAsync(cutoff.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc), cancellationToken);
    }
}
