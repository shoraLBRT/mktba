using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;
using Mktba.Infrastructure.UnitOfWork;
using NSubstitute;

namespace Mktba.Application.Tests;

/// <summary>E-02 (#75), decision B: one autosaved draft per user and article, invisible to others, dropped by a save and after 30 days.</summary>
public class ArticleDraftTests : IDisposable
{
    private static readonly DateTime Start = new(2026, 11, 22, 10, 0, 0, DateTimeKind.Utc);

    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly FeedbackTests.FakeClock _clock = new(Start);
    private readonly ArticleDraftService _drafts;
    private readonly ArticleContentService _content;

    public ArticleDraftTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync().Returns(_ => _context.SaveChangesAsync());
        _drafts = new ArticleDraftService(new ArticleDraftRepository(_context), uow, _clock);
        _content = new ArticleContentService(
            new ArticleRepository(_context), new ParagraphRepository(_context), uow, new TagRepository(_context), new ArticleDraftRepository(_context), _clock);
    }

    public void Dispose() => _context.Dispose();

    private async Task<int> AddUserAsync(string email)
    {
        var user = new User { Email = email, PasswordHash = "hash" };
        _context.Users.Add(user);
        await _context.SaveChangesAsync();
        return user.Id;
    }

    private static ArticleDraftSaveDto Draft(string title, DateTime? baseUpdatedAt = null) =>
        new(JsonSerializer.SerializeToElement(new { title, blocks = Array.Empty<object>() }), baseUpdatedAt);

    private Task<ArticleContentDto> CreateArticleAsync(int authorId) =>
        _content.CreateArticleWithContentAsync(new ArticleContentCreateDto(
            "Намаз",
            null,
            [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
            null,
            null,
            [],
            null), authorId);

    [Fact]
    public async Task GivenSavedDraft_WhenItsUserReadsIt_ThenTheSnapshotAndBaseComeBackAsWritten()
    {
        var userId = await AddUserAsync("writer@example.com");
        var article = await CreateArticleAsync(userId);
        var baseUpdatedAt = new DateTime(2026, 11, 20, 8, 30, 0, DateTimeKind.Utc);

        await _drafts.SaveAsync(userId, article.Id, Draft("Черновик", baseUpdatedAt));
        var read = await _drafts.GetAsync(userId, article.Id);

        read!.Snapshot.GetProperty("title").GetString().Should().Be("Черновик");
        read.BaseUpdatedAt.Should().Be(baseUpdatedAt);
        read.UpdatedAt.Should().Be(Start);
    }

    [Fact]
    public async Task GivenADraft_WhenSavedAgain_ThenTheOneDraftIsReplaced()
    {
        var userId = await AddUserAsync("writer@example.com");

        await _drafts.SaveAsync(userId, null, Draft("Первый"));
        _clock.Advance(TimeSpan.FromMinutes(1));
        await _drafts.SaveAsync(userId, null, Draft("Второй"));

        (await _context.ArticleDrafts.CountAsync()).Should().Be(1);
        var read = await _drafts.GetAsync(userId, null);
        read!.Snapshot.GetProperty("title").GetString().Should().Be("Второй");
        read.UpdatedAt.Should().Be(Start.AddMinutes(1));
    }

    [Fact]
    public async Task GivenTwoUsersOfOneArticle_WhenEachSavesADraft_ThenEachReadsOnlyTheirOwn()
    {
        var authorId = await AddUserAsync("author@example.com");
        var coAuthorId = await AddUserAsync("coauthor@example.com");
        var reviewerId = await AddUserAsync("reviewer@example.com");
        var article = await CreateArticleAsync(authorId);

        await _drafts.SaveAsync(authorId, article.Id, Draft("Автор"));
        await _drafts.SaveAsync(coAuthorId, article.Id, Draft("Соавтор"));

        (await _drafts.GetAsync(authorId, article.Id))!.Snapshot.GetProperty("title").GetString().Should().Be("Автор");
        (await _drafts.GetAsync(coAuthorId, article.Id))!.Snapshot.GetProperty("title").GetString().Should().Be("Соавтор");
        (await _drafts.GetAsync(reviewerId, article.Id)).Should().BeNull();
        (await _drafts.GetAsync(authorId, null)).Should().BeNull();
    }

    [Fact]
    public async Task GivenNewArticleDraft_WhenSaved_ThenTheBaseIsIgnored()
    {
        var userId = await AddUserAsync("writer@example.com");

        await _drafts.SaveAsync(userId, null, Draft("Новая", Start));

        (await _drafts.GetAsync(userId, null))!.BaseUpdatedAt.Should().BeNull();
    }

    [Fact]
    public async Task GivenSnapshotThatIsNotAnObject_WhenSaved_ThenItIsRefused()
    {
        var userId = await AddUserAsync("writer@example.com");

        var act = () => _drafts.SaveAsync(userId, null, new ArticleDraftSaveDto(JsonSerializer.SerializeToElement("текст"), null));

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_draft_snapshot_invalid");
    }

    [Fact]
    public async Task GivenSnapshotOverTheLimit_WhenSaved_ThenItIsRefusedAndNothingIsStored()
    {
        var userId = await AddUserAsync("writer@example.com");
        var huge = new string('а', ArticleDraftService.SnapshotMaxLength);

        var act = () => _drafts.SaveAsync(userId, null, Draft(huge));

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_draft_too_large");
        (await _context.ArticleDrafts.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task GivenDraftsOfTwoUsers_WhenOneSavesTheArticle_ThenOnlyTheSaversDraftIsDeleted()
    {
        var authorId = await AddUserAsync("author@example.com");
        var otherId = await AddUserAsync("other@example.com");
        var article = await CreateArticleAsync(authorId);
        await _drafts.SaveAsync(authorId, article.Id, Draft("Автор"));
        await _drafts.SaveAsync(otherId, article.Id, Draft("Другой"));
        _context.ChangeTracker.Clear();

        var current = await _content.GetContentByArticleIdAsync(article.Id, TestViewers.Admin);
        var (success, error) = await _content.UpdateContentAsync(article.Id, current with
        {
            Title = "Намаз (правка)",
            Paragraphs = [new ParagraphDto { Order = 1, Opinions = [new OpinionDto { Content = "Правка", IsDefault = true }] }],
        }, authorId);

        success.Should().BeTrue(error?.Code);
        (await _drafts.GetAsync(authorId, article.Id)).Should().BeNull();
        (await _drafts.GetAsync(otherId, article.Id)).Should().NotBeNull();
    }

    [Fact]
    public async Task GivenNewArticleDraft_WhenTheUserCreatesTheArticle_ThenTheDraftIsDeleted()
    {
        var userId = await AddUserAsync("writer@example.com");
        await _drafts.SaveAsync(userId, null, Draft("Новая"));

        await CreateArticleAsync(userId);

        (await _drafts.GetAsync(userId, null)).Should().BeNull();
    }

    [Fact]
    public async Task GivenDraftUntouchedFor30Days_WhenReadOrCleanedUp_ThenItIsGone()
    {
        var userId = await AddUserAsync("writer@example.com");
        var article = await CreateArticleAsync(userId);
        await _drafts.SaveAsync(userId, article.Id, Draft("Старый"));
        _clock.Advance(TimeSpan.FromDays(10));
        await _drafts.SaveAsync(userId, null, Draft("Свежий"));
        _clock.Advance(ArticleDraftService.Lifetime - TimeSpan.FromDays(10) + TimeSpan.FromSeconds(1));

        var stale = await _drafts.GetAsync(userId, article.Id);
        var removed = await _drafts.DeleteExpiredAsync();

        stale.Should().BeNull();
        removed.Should().Be(1);
        (await _drafts.GetAsync(userId, null)).Should().NotBeNull();
    }

    [Fact]
    public async Task GivenDraft_WhenDeleted_ThenItIsGoneAndDeletingAgainIsHarmless()
    {
        var userId = await AddUserAsync("writer@example.com");
        await _drafts.SaveAsync(userId, null, Draft("Новая"));

        await _drafts.DeleteAsync(userId, null);
        await _drafts.DeleteAsync(userId, null);

        (await _drafts.GetAsync(userId, null)).Should().BeNull();
    }
}
