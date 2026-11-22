using Mktba.Application.DTOs;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services
{
    /// <summary>
    /// The activity chart of the signed-in author (P-04, #92): edits and publications per week, from
    /// the revision history and the articles' first publication dates. Weeks run Monday to Sunday in UTC.
    /// </summary>
    public class UserActivityService
    {
        public const int DefaultWeeks = 12;
        public const int MaxWeeks = 52;

        private readonly ArticleRepository _articles;
        private readonly TimeProvider _clock;

        public UserActivityService(ArticleRepository articles, TimeProvider clock)
        {
            _articles = articles;
            _clock = clock;
        }

        /// <summary>
        /// The last <paramref name="weeks"/> weeks (kept within 1 to <see cref="MaxWeeks"/>) of
        /// <paramref name="userId"/>'s activity, every week present even when empty.
        /// </summary>
        public async Task<UserActivityDto> GetAsync(int userId, int weeks, CancellationToken cancellationToken = default)
        {
            var count = Math.Clamp(weeks, 1, MaxWeeks);
            var firstWeek = WeekStartOf(_clock.GetUtcNow().UtcDateTime).AddDays(-7 * (count - 1));
            var from = firstWeek.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);

            var edits = await _articles.GetRevisionTimesByAuthorAsync(userId, from, cancellationToken);
            var publications = await _articles.GetFirstPublicationTimesCreditedToAsync(userId, from, cancellationToken);

            return new UserActivityDto(Bucket(firstWeek, count, edits, publications));
        }

        /// <summary>The Monday of the UTC week <paramref name="utc"/> falls in.</summary>
        public static DateOnly WeekStartOf(DateTime utc)
        {
            var day = DateOnly.FromDateTime(utc);
            var sinceMonday = ((int)day.DayOfWeek + 6) % 7;
            return day.AddDays(-sinceMonday);
        }

        /// <summary>
        /// Counts <paramref name="edits"/> and <paramref name="publications"/> into <paramref name="count"/>
        /// weeks from <paramref name="firstWeek"/>; times outside those weeks are left out.
        /// </summary>
        public static IReadOnlyList<ActivityWeekDto> Bucket(
            DateOnly firstWeek, int count, IEnumerable<DateTime> edits, IEnumerable<DateTime> publications)
        {
            var editCounts = new int[count];
            var publicationCounts = new int[count];
            Count(edits, editCounts);
            Count(publications, publicationCounts);
            return Enumerable.Range(0, count)
                .Select(index => new ActivityWeekDto(firstWeek.AddDays(7 * index), editCounts[index], publicationCounts[index]))
                .ToList();

            void Count(IEnumerable<DateTime> times, int[] counts)
            {
                foreach (var time in times)
                {
                    var index = (WeekStartOf(time).DayNumber - firstWeek.DayNumber) / 7;
                    if (index >= 0 && index < count)
                    {
                        counts[index]++;
                    }
                }
            }
        }
    }
}
