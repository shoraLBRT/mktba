using Mktba.Domain.Entities;

namespace Mktba.Application.Services.Analytics;

/// <summary>
/// The Web Vitals the site measures on real page loads (N-11, #153): Largest Contentful Paint and
/// Interaction to Next Paint in milliseconds, Cumulative Layout Shift as a score. The rating limits
/// are Google's published thresholds: at most <see cref="GoodLimit"/> is good, above
/// <see cref="PoorLimit"/> is poor, between them needs improvement.
/// </summary>
public static class WebVitals
{
    /// <summary>The metrics, in the order the dashboard shows them.</summary>
    public static readonly AnalyticsEventType[] Metrics =
        [AnalyticsEventType.WebVitalLcp, AnalyticsEventType.WebVitalInp, AnalyticsEventType.WebVitalCls];

    public static bool IsWebVital(AnalyticsEventType type) => Metrics.Contains(type);

    /// <summary>The largest value kept: anything above it (a tab left open for an hour, a broken clock) is dropped.</summary>
    public static double MaxValue(AnalyticsEventType metric) => metric == AnalyticsEventType.WebVitalCls ? 10 : 60_000;

    public static double GoodLimit(AnalyticsEventType metric) => metric switch
    {
        AnalyticsEventType.WebVitalLcp => 2500,
        AnalyticsEventType.WebVitalInp => 200,
        _ => 0.1,
    };

    public static double PoorLimit(AnalyticsEventType metric) => metric switch
    {
        AnalyticsEventType.WebVitalLcp => 4000,
        AnalyticsEventType.WebVitalInp => 500,
        _ => 0.25,
    };

    /// <summary>The 75th percentile of <paramref name="values"/> by nearest rank; the list is sorted in place.</summary>
    public static double P75(List<double> values)
    {
        values.Sort();
        return values[(int)Math.Ceiling(values.Count * 0.75) - 1];
    }
}
