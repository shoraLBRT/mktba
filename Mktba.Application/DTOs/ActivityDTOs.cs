namespace Mktba.Application.DTOs
{
    /// <summary>One week of a user's activity (P-04, #92).</summary>
    /// <param name="WeekStart">The Monday the week starts on (UTC calendar).</param>
    /// <param name="Edits">Revisions the user saved that week, restores included.</param>
    /// <param name="Publications">The user's articles (written or co-authored) first published that week.</param>
    public record ActivityWeekDto(DateOnly WeekStart, int Edits, int Publications);

    /// <summary>A user's activity by week, oldest week first; the last one is the current week, so far.</summary>
    public record UserActivityDto(IReadOnlyList<ActivityWeekDto> Weeks);
}
