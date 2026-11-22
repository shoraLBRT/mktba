using Mktba.Application.Exceptions;

namespace Mktba.Application.Services.Analytics;

/// <summary>
/// The UTC days a dashboard covers, both ends included (N-08, #102): the last few days ending today,
/// or a range the reader picked. <see cref="Previous"/> is the period of the same length just before
/// it, which the dashboards compare their totals with.
/// </summary>
public sealed record AnalyticsPeriod(DateOnly From, DateOnly To)
{
    /// <summary>The longest period a dashboard reads, in days.</summary>
    public const int MaxDays = 365;

    public int Days => To.DayNumber - From.DayNumber + 1;

    /// <summary>The same number of days, ending the day before <see cref="From"/>.</summary>
    public AnalyticsPeriod Previous => new(From.AddDays(-Days), From.AddDays(-1));

    /// <summary>Every day of the period, oldest first.</summary>
    public IEnumerable<DateOnly> EachDay() => Enumerable.Range(0, Days).Select(From.AddDays);

    /// <summary>The last <paramref name="days"/> days ending <paramref name="today"/>, kept within 1 to <see cref="MaxDays"/>.</summary>
    public static AnalyticsPeriod Last(int days, DateOnly today)
        => new(today.AddDays(-(Math.Clamp(days, 1, MaxDays) - 1)), today);

    /// <summary>
    /// The period a request asks for. Without <paramref name="from"/> and <paramref name="to"/> it is
    /// <see cref="Last"/>(<paramref name="days"/> or <paramref name="defaultDays"/>). Otherwise a missing
    /// <paramref name="to"/> is today, a day after today counts as today (the future has no data), and a
    /// missing <paramref name="from"/> is that many days before <paramref name="to"/>.
    /// </summary>
    /// <exception cref="ValidationException">
    /// <c>analytics_period_invalid</c>: <paramref name="from"/> after <paramref name="to"/>;
    /// <c>analytics_period_too_long</c>: longer than <see cref="MaxDays"/> days.
    /// </exception>
    public static AnalyticsPeriod Resolve(int? days, DateOnly? from, DateOnly? to, DateOnly today, int defaultDays)
    {
        if (from is null && to is null)
        {
            return Last(days ?? defaultDays, today);
        }

        var end = to is { } last && last < today ? last : today;
        var start = from ?? end.AddDays(-(Math.Clamp(days ?? defaultDays, 1, MaxDays) - 1));
        if (start > end)
        {
            throw new ValidationException(AppErrors.AnalyticsPeriodInvalid);
        }

        var period = new AnalyticsPeriod(start, end);
        if (period.Days > MaxDays)
        {
            throw new ValidationException(AppErrors.AnalyticsPeriodTooLong(MaxDays));
        }

        return period;
    }
}
