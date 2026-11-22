using AutoMapper;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Mktba.Application.Exceptions;
using Mktba.Application.Mappings;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>U-09 (#135): publications, deletions and role changes are logged with who, what and when.</summary>
public sealed class AuditLogTests : IDisposable
{
    private static readonly DateTime Start = new(2026, 11, 22, 12, 0, 0, DateTimeKind.Utc);

    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly FeedbackTests.FakeClock _clock = new(Start);
    private readonly ArticleService _articles;
    private readonly UserAdminService _users;
    private readonly AuditLogService _log;
    private readonly User _admin;

    public AuditLogTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        var mapper = new MapperConfiguration(cfg => cfg.AddProfile<MappingProfile>(), NullLoggerFactory.Instance).CreateMapper();
        var auditLog = new AuditLogRepository(_context);
        _articles = new ArticleService(new ArticleRepository(_context), mapper, _clock, new RecordingSearchEngineNotifier(), auditLog);
        _users = new UserAdminService(new UserRepository(_context), auditLog, _clock);
        _log = new AuditLogService(auditLog);
        _admin = new User { Email = "admin@mktba.test", DisplayName = "Админ", Role = UserRole.Admin, PasswordHash = "x" };
        _context.Users.Add(_admin);
        _context.SaveChanges();
    }

    public void Dispose() => _context.Dispose();

    [Fact]
    public async Task GivenArticleInReview_WhenPublished_ThenTheMoveIsLoggedWithWhoAndWhen()
    {
        var article = await AddArticleAsync("Намаз", ArticleStatus.InReview);

        await _articles.ChangeStatusAsync(article.Id, ArticleStatus.Published, TestViewers.Admin, _admin.Id);

        var page = await _log.GetPageAsync(null, null, null, null);
        page.Total.Should().Be(1);
        page.Items.Should().ContainSingle().Which.Should().BeEquivalentTo(new
        {
            OccurredAt = Start,
            Action = AuditAction.ArticleStatusChanged,
            ActorId = (int?)_admin.Id,
            Actor = new { Id = _admin.Id, Email = "admin@mktba.test", DisplayName = "Админ" },
            ArticleId = (int?)article.Id,
            ArticleTitle = "Намаз",
            ArticleAvailable = true,
            TargetUserId = (int?)null,
            FromValue = "InReview",
            ToValue = "Published",
        });
    }

    [Fact]
    public async Task GivenRefusedStatusMove_WhenAttempted_ThenNothingIsLogged()
    {
        var article = await AddArticleAsync("Черновик", ArticleStatus.Draft);

        var act = () => _articles.ChangeStatusAsync(article.Id, ArticleStatus.Archived, TestViewers.Admin, _admin.Id);

        await act.Should().ThrowAsync<ValidationException>();
        (await _log.GetPageAsync(null, null, null, null)).Total.Should().Be(0);
    }

    [Fact]
    public async Task GivenArticle_WhenTrashedRestoredTrashedAndPurged_ThenEachStepIsLoggedNewestFirstAndTheTitleOutlivesThePurge()
    {
        var article = await AddArticleAsync("Пост", ArticleStatus.Published);

        await _articles.MoveToTrashAsync(article.Id, _admin.Id);
        _clock.Advance(TimeSpan.FromMinutes(1));
        await _articles.RestoreAsync(article.Id, _admin.Id);
        _clock.Advance(TimeSpan.FromMinutes(1));
        await _articles.MoveToTrashAsync(article.Id, _admin.Id);
        _clock.Advance(TimeSpan.FromMinutes(1));
        await _articles.PurgeAsync(article.Id, _admin.Id);
        _context.ChangeTracker.Clear();

        var page = await _log.GetPageAsync(null, null, null, null);
        page.Items.Select(entry => entry.Action).Should().Equal(
            AuditAction.ArticlePurged, AuditAction.ArticleTrashed, AuditAction.ArticleRestored, AuditAction.ArticleTrashed);
        page.Items.Should().OnlyContain(entry => entry.ArticleId == article.Id
            && entry.ArticleTitle == "Пост"
            && !entry.ArticleAvailable
            && entry.ActorId == _admin.Id);
        page.Items[0].OccurredAt.Should().Be(Start.AddMinutes(3));

        var purges = await _log.GetPageAsync(AuditAction.ArticlePurged, null, null, null);
        purges.Total.Should().Be(1);
    }

    [Fact]
    public async Task GivenArticleInTrash_WhenRead_ThenItIsNotAvailable()
    {
        var article = await AddArticleAsync("Корзина", ArticleStatus.Draft);

        await _articles.MoveToTrashAsync(article.Id, _admin.Id);
        _context.ChangeTracker.Clear();

        var entry = (await _log.GetPageAsync(null, null, article.Id, null)).Items.Should().ContainSingle().Subject;
        entry.Action.Should().Be(AuditAction.ArticleTrashed);
        entry.ArticleAvailable.Should().BeFalse();
    }

    [Fact]
    public async Task GivenUser_WhenGivenAnotherRole_ThenTheChangeIsLoggedButTheSameRoleIsNot()
    {
        var author = new User { Email = "author@mktba.test", Role = UserRole.Reader, PasswordHash = "x" };
        _context.Users.Add(author);
        await _context.SaveChangesAsync();

        await _users.ChangeRoleAsync(author.Id, UserRole.Author, _admin.Id);
        await _users.ChangeRoleAsync(author.Id, UserRole.Author, _admin.Id);

        var page = await _log.GetPageAsync(AuditAction.UserRoleChanged, null, null, author.Id);
        page.Items.Should().ContainSingle().Which.Should().BeEquivalentTo(new
        {
            ActorId = (int?)_admin.Id,
            TargetUserId = (int?)author.Id,
            TargetUser = new { Id = author.Id, Email = "author@mktba.test", DisplayName = (string?)null },
            ArticleId = (int?)null,
            FromValue = "Reader",
            ToValue = "Author",
        });
    }

    [Fact]
    public async Task GivenTheLastAdmin_WhenDemotionIsRefused_ThenNothingIsLogged()
    {
        var act = () => _users.ChangeRoleAsync(_admin.Id, UserRole.Reader, _admin.Id);

        await act.Should().ThrowAsync<ValidationException>();
        (await _log.GetPageAsync(null, null, null, null)).Total.Should().Be(0);
    }

    [Fact]
    public async Task GivenActorDeleted_WhenRead_ThenTheIdStaysWithoutTheUser()
    {
        var other = new User { Email = "gone@mktba.test", Role = UserRole.Admin, PasswordHash = "x" };
        _context.Users.Add(other);
        await _context.SaveChangesAsync();
        var article = await AddArticleAsync("Статья", ArticleStatus.InReview);
        await _articles.ChangeStatusAsync(article.Id, ArticleStatus.Published, TestViewers.Admin, other.Id);
        _context.Users.Remove(other);
        await _context.SaveChangesAsync();

        var entry = (await _log.GetPageAsync(null, null, null, null)).Items.Should().ContainSingle().Subject;
        entry.ActorId.Should().Be(other.Id);
        entry.Actor.Should().BeNull();
    }

    [Fact]
    public async Task GivenManyEntries_WhenPagedAndFilteredByActor_ThenBoundsApplyAndOnlyTheActorsEntriesCome()
    {
        var other = new User { Email = "other@mktba.test", Role = UserRole.Admin, PasswordHash = "x" };
        _context.Users.Add(other);
        await _context.SaveChangesAsync();
        for (var i = 0; i < 3; i++)
        {
            var article = await AddArticleAsync($"Статья {i}", ArticleStatus.InReview);
            await _articles.ChangeStatusAsync(article.Id, ArticleStatus.Published, TestViewers.Admin, i == 0 ? other.Id : _admin.Id);
            _clock.Advance(TimeSpan.FromSeconds(1));
        }

        var second = await _log.GetPageAsync(null, null, null, null, page: 2, pageSize: 2);
        second.Should().BeEquivalentTo(new { Total = 3, Page = 2, PageSize = 2 }, options => options.ExcludingMissingMembers());
        second.Items.Should().ContainSingle().Which.ArticleTitle.Should().Be("Статья 0");

        var bounded = await _log.GetPageAsync(null, null, null, null, page: 0, pageSize: 1000);
        bounded.Page.Should().Be(1);
        bounded.PageSize.Should().Be(AuditLogService.MaxPageSize);

        var byOther = await _log.GetPageAsync(null, other.Id, null, null);
        byOther.Items.Should().ContainSingle().Which.ArticleTitle.Should().Be("Статья 0");
    }

    private async Task<Article> AddArticleAsync(string title, ArticleStatus status)
    {
        var article = new Article { Title = title, Slug = $"a-{Guid.NewGuid():N}", Status = status };
        _context.Articles.Add(article);
        await _context.SaveChangesAsync();
        return article;
    }
}
