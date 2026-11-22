using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>P-04 (#92): an author's edits and publications counted by UTC week.</summary>
public class UserActivityTests : IDisposable
{
    // Wednesday; its week starts on Monday 2026-11-16.
    private static readonly DateTime Now = new(2026, 11, 18, 12, 0, 0, DateTimeKind.Utc);
    private static readonly DateOnly ThisWeek = new(2026, 11, 16);

    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly UserActivityService _service;

    public UserActivityTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        _service = new UserActivityService(new ArticleRepository(_context), new FixedClock(Now));
    }

    public void Dispose() => _context.Dispose();

    [Theory]
    [InlineData("2026-11-16T00:00:00", "2026-11-16")]
    [InlineData("2026-11-22T23:59:59", "2026-11-16")]
    [InlineData("2026-11-15T23:59:59", "2026-11-09")]
    [InlineData("2026-01-01T10:00:00", "2025-12-29")]
    public void WeekStartOf_GivenAnyDay_ReturnsTheMondayOfItsWeek(string time, string monday)
    {
        UserActivityService.WeekStartOf(DateTime.SpecifyKind(DateTime.Parse(time), DateTimeKind.Utc))
            .Should().Be(DateOnly.Parse(monday));
    }

    [Fact]
    public async Task GetAsync_GivenNoActivity_ReturnsEveryWeekEmptyOldestFirst()
    {
        var userId = await AddUserAsync("idle@mktba.ru");

        var activity = await _service.GetAsync(userId, 3);

        activity.Weeks.Should().Equal(
            new ActivityWeekDto(ThisWeek.AddDays(-14), 0, 0),
            new ActivityWeekDto(ThisWeek.AddDays(-7), 0, 0),
            new ActivityWeekDto(ThisWeek, 0, 0));
    }

    [Fact]
    public async Task GetAsync_GivenOwnAndForeignSavesAndPublications_CountsOnlyTheUsersInTheirWeeks()
    {
        var authorId = await AddUserAsync("author@mktba.ru");
        var otherId = await AddUserAsync("other@mktba.ru");
        var written = await AddArticleAsync(authorId, publishedAt: Now.AddDays(-1));
        var coAuthored = await AddArticleAsync(otherId, publishedAt: Now.AddDays(-8), coAuthorId: authorId);
        await AddArticleAsync(otherId, publishedAt: Now.AddDays(-2));
        await AddArticleAsync(authorId, publishedAt: null);
        await AddArticleAsync(authorId, publishedAt: Now.AddDays(-30));
        await AddRevisionAsync(written, authorId, Now.AddHours(-1));
        await AddRevisionAsync(written, authorId, ThisWeek.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
        await AddRevisionAsync(coAuthored, authorId, Now.AddDays(-9));
        await AddRevisionAsync(coAuthored, otherId, Now.AddDays(-1));
        await AddRevisionAsync(written, null, Now.AddDays(-1));
        await AddRevisionAsync(written, authorId, Now.AddDays(-15));

        var activity = await _service.GetAsync(authorId, 2);

        activity.Weeks.Should().Equal(
            new ActivityWeekDto(ThisWeek.AddDays(-7), 1, 1),
            new ActivityWeekDto(ThisWeek, 2, 1));
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(-5, 1)]
    [InlineData(500, UserActivityService.MaxWeeks)]
    public async Task GetAsync_GivenWeeksOutOfRange_KeepsThemWithinLimits(int requested, int expected)
    {
        var userId = await AddUserAsync("limits@mktba.ru");

        var activity = await _service.GetAsync(userId, requested);

        activity.Weeks.Should().HaveCount(expected);
        activity.Weeks[^1].WeekStart.Should().Be(ThisWeek);
    }

    private async Task<int> AddUserAsync(string email)
    {
        var user = new User { Email = email, PasswordHash = "hash" };
        _context.Users.Add(user);
        await _context.SaveChangesAsync();
        return user.Id;
    }

    private async Task<int> AddArticleAsync(int authorId, DateTime? publishedAt, int? coAuthorId = null)
    {
        var article = new Article
        {
            Title = "Статья",
            Slug = $"statya-{Guid.NewGuid():N}",
            AuthorId = authorId,
            Status = publishedAt is null ? ArticleStatus.Draft : ArticleStatus.Published,
            PublishedAt = publishedAt,
        };
        if (coAuthorId is int coAuthor)
        {
            article.CoAuthors.Add(new ArticleCoAuthor { UserId = coAuthor });
        }
        _context.Articles.Add(article);
        await _context.SaveChangesAsync();
        return article.Id;
    }

    private async Task AddRevisionAsync(int articleId, int? authorId, DateTime createdAt)
    {
        var number = _context.ArticleRevisions.Count(revision => revision.ArticleId == articleId) + 1;
        _context.ArticleRevisions.Add(new ArticleRevision
        {
            ArticleId = articleId, Number = number, AuthorId = authorId, CreatedAt = createdAt, Snapshot = "{}",
        });
        await _context.SaveChangesAsync();
    }

    private sealed class FixedClock(DateTime now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(now);
    }
}
