using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Comments;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Application.Tests;

/// <summary>C-01 (#127): readers' comments under a published article — the tree, editing, soft deletion, the limits.</summary>
public sealed class ArticleCommentTests : IDisposable
{
    private static readonly DateTime Now = new(2026, 11, 26, 10, 0, 0, DateTimeKind.Utc);

    private readonly MktbaDbContext _db;
    private readonly FeedbackTests.FakeClock _clock = new(Now);
    private CommentOptions _options = new() { PerUserLimit = 0 };

    public ArticleCommentTests()
    {
        _db = new MktbaDbContext(new DbContextOptionsBuilder<MktbaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        _db.Database.EnsureCreated();
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task GivenPublishedArticle_WhenAReaderCommentsAndAnotherReplies_ThenEveryoneSeesTheTreeSignedWithNamesAndOnlyTheAuthorsMayChangeTheirOwn()
    {
        var articleId = await ArticleAsync();
        var aisha = await UserAsync(name: "Аиша");
        var umar = await UserAsync(name: "Умар");

        var root = await Service().CreateAsync(articleId, aisha, new ArticleCommentCreateDto("  **Спасибо** за статью!\r\nЕсть вопрос.  ", null, null), default);
        _clock.Advance(TimeSpan.FromMinutes(1));
        var reply = await Service().CreateAsync(articleId, umar, new ArticleCommentCreateDto("> Есть вопрос.\n\nСпрашивайте.", root.Id, ""), default);

        (root.Body, root.AuthorName, root.IsMine, root.CanEdit, root.CanDelete, root.CreatedAt)
            .Should().Be(("**Спасибо** за статью!\nЕсть вопрос.", "Аиша", true, true, true, Now));
        reply.ParentId.Should().Be(root.Id);

        var anonymous = await Service().ListAsync(articleId, null, 1, 20, default);
        anonymous.Items.Select(item => (item.Id, item.ParentId, item.AuthorName)).Should().Equal(
            (root.Id, (int?)null, "Аиша"), (reply.Id, (int?)root.Id, "Умар"));
        anonymous.Items.Should().OnlyContain(item => !item.IsMine && !item.CanEdit && !item.CanDelete);
        (anonymous.Total, anonymous.Threads, anonymous.Viewer).Should().Be((2, 1, new ArticleCommentViewerDto(false, ArticleCommentBlock.SignInRequired)));

        var forUmar = await Service().ListAsync(articleId, umar, 1, 20, default);
        forUmar.Viewer.Should().Be(new ArticleCommentViewerDto(true, null));
        forUmar.Items.Select(item => (item.IsMine, item.CanEdit, item.CanDelete)).Should().Equal((false, false, false), (true, true, true));
        var forAdmin = await Service().ListAsync(articleId, await UserAsync(UserRole.Admin, "Админ"), 1, 20, default);
        forAdmin.Items.Should().OnlyContain(item => item.CanDelete && !item.CanEdit);
    }

    [Fact]
    public async Task GivenUserWithoutConfirmedEmailOrName_WhenTheyComment_ThenItIsRefusedAndTheViewerSaysWhy()
    {
        var articleId = await ArticleAsync();
        var unconfirmed = await UserAsync(name: "Новичок", confirmed: false);
        var nameless = await UserAsync(name: null);

        var first = () => Service().CreateAsync(articleId, unconfirmed, new ArticleCommentCreateDto("Текст", null, null), default);
        var second = () => Service().CreateAsync(articleId, nameless, new ArticleCommentCreateDto("Текст", null, null), default);

        (await first.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("email_not_confirmed");
        (await second.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("comment_display_name_required");
        (await Service().ListAsync(articleId, unconfirmed, 1, 20, default)).Viewer.Block.Should().Be(ArticleCommentBlock.EmailNotConfirmed);
        (await Service().ListAsync(articleId, nameless, 1, 20, default)).Viewer.Block.Should().Be(ArticleCommentBlock.DisplayNameRequired);
        (await _db.ArticleComments.CountAsync()).Should().Be(0);
    }

    [Theory]
    [InlineData(ArticleStatus.Draft, false)]
    [InlineData(ArticleStatus.InReview, false)]
    [InlineData(ArticleStatus.Archived, false)]
    [InlineData(ArticleStatus.Published, true)]
    public async Task GivenArticleReadersAreNotServed_WhenListingOrCommenting_ThenItAnswersArticleNotFound(ArticleStatus status, bool trashed)
    {
        var articleId = await ArticleAsync(status, trashed);
        var userId = await UserAsync();

        var list = () => Service().ListAsync(articleId, null, 1, 20, default);
        var create = () => Service().CreateAsync(articleId, userId, new ArticleCommentCreateDto("Текст", null, null), default);

        (await list.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("article_not_found");
        (await create.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("article_not_found");
    }

    [Fact]
    public async Task GivenCommentWritten_WhenItsArticleIsUnpublished_ThenEditingAndDeletingAnswerCommentNotFound()
    {
        var articleId = await ArticleAsync();
        var userId = await UserAsync();
        var comment = await Service().CreateAsync(articleId, userId, new ArticleCommentCreateDto("Текст", null, null), default);
        (await _db.Articles.SingleAsync(a => a.Id == articleId)).Status = ArticleStatus.Archived;
        await _db.SaveChangesAsync();

        var edit = () => Service().UpdateAsync(comment.Id, userId, new ArticleCommentUpdateDto("Новый"), default);
        var delete = () => Service().DeleteAsync(comment.Id, userId, default);

        (await edit.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("comment_not_found");
        (await delete.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("comment_not_found");
    }

    [Theory]
    [InlineData(null, "comment_body_required")]
    [InlineData(" \r\n\t ", "comment_body_required")]
    [InlineData("‮⁦", "comment_body_required")]
    public async Task GivenEmptyBody_WhenCommenting_ThenItIsRefused(string? body, string code)
    {
        var articleId = await ArticleAsync();
        var userId = await UserAsync();

        var create = () => Service().CreateAsync(articleId, userId, new ArticleCommentCreateDto(body, null, null), default);

        (await create.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be(code);
    }

    [Fact]
    public async Task GivenBodyOverTheLimit_WhenCommenting_ThenItIsRefusedWithTheLimit()
    {
        var articleId = await ArticleAsync();
        var userId = await UserAsync();

        var create = () => Service().CreateAsync(
            articleId, userId, new ArticleCommentCreateDto(new string('а', ArticleComment.BodyMaxLength + 1), null, null), default);
        var atLimit = await Service().CreateAsync(
            articleId, userId, new ArticleCommentCreateDto(new string('а', ArticleComment.BodyMaxLength), null, null), default);

        var error = (await create.Should().ThrowAsync<ValidationException>()).Which.Error;
        (error.Code, error.Params!["maxLength"]).Should().Be(("comment_body_too_long", (object?)ArticleComment.BodyMaxLength));
        atLimit.Body!.Length.Should().Be(ArticleComment.BodyMaxLength);
    }

    [Fact]
    public async Task GivenBodyWithMarkupControlsAndBidiOverrides_WhenCommenting_ThenItIsStoredAsTypedTextWithoutThem()
    {
        var articleId = await ArticleAsync();
        var userId = await UserAsync();

        var comment = await Service().CreateAsync(
            articleId, userId, new ArticleCommentCreateDto("<script>alert(1)</script>\u0000 [x](javascript:alert(1)) ‮abc⁩‏", null, null), default);

        comment.Body.Should().Be("<script>alert(1)</script> [x](javascript:alert(1)) abc‏");
        (await _db.ArticleComments.SingleAsync()).Body.Should().Be(comment.Body);
    }

    [Fact]
    public async Task GivenTrapFieldFilled_WhenCommenting_ThenItLooksAcceptedButNothingIsStored()
    {
        var articleId = await ArticleAsync();
        var userId = await UserAsync();

        var answer = await Service().CreateAsync(articleId, userId, new ArticleCommentCreateDto("Купите", null, "http://spam.example"), default);

        answer.Id.Should().Be(0);
        (await _db.ArticleComments.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task GivenReplyToAnotherArticlesOrADeletedComment_WhenReplying_ThenItIsRefused()
    {
        var articleId = await ArticleAsync();
        var otherArticleId = await ArticleAsync();
        var userId = await UserAsync();
        var elsewhere = await Service().CreateAsync(otherArticleId, userId, new ArticleCommentCreateDto("Там", null, null), default);
        var deleted = await Service().CreateAsync(articleId, userId, new ArticleCommentCreateDto("Здесь", null, null), default);
        await Service().DeleteAsync(deleted.Id, userId, default);

        var toOther = () => Service().CreateAsync(articleId, userId, new ArticleCommentCreateDto("Ответ", elsewhere.Id, null), default);
        var toDeleted = () => Service().CreateAsync(articleId, userId, new ArticleCommentCreateDto("Ответ", deleted.Id, null), default);

        (await toOther.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("comment_not_found");
        (await toDeleted.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("comment_deleted");
    }

    [Fact]
    public async Task GivenOwnComment_WhenTheAuthorEditsIt_ThenTheTextChangesAndItIsMarkedEditedWhileOthersAreRefused()
    {
        var articleId = await ArticleAsync();
        var authorId = await UserAsync();
        var otherId = await UserAsync();
        var adminId = await UserAsync(UserRole.Admin);
        var comment = await Service().CreateAsync(articleId, authorId, new ArticleCommentCreateDto("Черновик", null, null), default);
        _clock.Advance(TimeSpan.FromMinutes(5));

        var same = await Service().UpdateAsync(comment.Id, authorId, new ArticleCommentUpdateDto(" Черновик "), default);
        var edited = await Service().UpdateAsync(comment.Id, authorId, new ArticleCommentUpdateDto("Исправлено"), default);
        var byOther = () => Service().UpdateAsync(comment.Id, otherId, new ArticleCommentUpdateDto("Чужое"), default);
        var byAdmin = () => Service().UpdateAsync(comment.Id, adminId, new ArticleCommentUpdateDto("Админ"), default);

        same.EditedAt.Should().BeNull();
        (edited.Body, edited.EditedAt).Should().Be(("Исправлено", (DateTime?)Now.AddMinutes(5)));
        await byOther.Should().ThrowAsync<ForbiddenException>();
        await byAdmin.Should().ThrowAsync<ForbiddenException>();
        (await _db.ArticleComments.SingleAsync()).Body.Should().Be("Исправлено");
    }

    [Fact]
    public async Task GivenCommentsWithReplies_WhenDeleted_ThenTheTextIsErasedTheRepliesStayAndALeafWithoutRepliesDisappears()
    {
        var articleId = await ArticleAsync();
        var authorId = await UserAsync(name: "Автор");
        var otherId = await UserAsync(name: "Другой");
        var adminId = await UserAsync(UserRole.Admin, "Админ");
        var root = await Service().CreateAsync(articleId, authorId, new ArticleCommentCreateDto("Корень", null, null), default);
        var reply = await Service().CreateAsync(articleId, otherId, new ArticleCommentCreateDto("Ответ", root.Id, null), default);
        var lone = await Service().CreateAsync(articleId, otherId, new ArticleCommentCreateDto("Одинокий", null, null), default);

        var byStranger = () => Service().DeleteAsync(root.Id, otherId, default);
        await byStranger.Should().ThrowAsync<ForbiddenException>();
        await Service().DeleteAsync(root.Id, authorId, default);
        await Service().DeleteAsync(root.Id, authorId, default);
        await Service().DeleteAsync(lone.Id, adminId, default);

        var page = await Service().ListAsync(articleId, authorId, 1, 20, default);
        page.Items.Select(item => (item.Id, item.IsDeleted, item.Body, item.AuthorName)).Should().Equal(
            (root.Id, true, (string?)null, (string?)null), (reply.Id, false, "Ответ", "Другой"));
        page.Items[0].Should().Match<ArticleCommentDto>(item => !item.IsMine && !item.CanEdit && !item.CanDelete);
        (page.Total, page.Threads).Should().Be((1, 1));
        var stored = await _db.ArticleComments.AsNoTracking().SingleAsync(c => c.Id == root.Id);
        (stored.Body, stored.DeletedAt, stored.DeletedById).Should().Be(("", (DateTime?)Now, (int?)authorId));
        (await _db.ArticleComments.AsNoTracking().SingleAsync(c => c.Id == lone.Id)).DeletedById.Should().Be(adminId);
        var edit = () => Service().UpdateAsync(root.Id, authorId, new ArticleCommentUpdateDto("Снова"), default);
        (await edit.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("comment_deleted");

        await Service().DeleteAsync(reply.Id, otherId, default);
        (await Service().ListAsync(articleId, null, 1, 20, default)).Items.Should().BeEmpty();
    }

    [Fact]
    public async Task GivenManyThreads_WhenListingPages_ThenEachPageHoldsItsTopLevelCommentsOldestFirstEachFollowedByItsWholeTree()
    {
        var articleId = await ArticleAsync();
        var userId = await UserAsync();
        async Task<int> Write(string body, int? parentId)
        {
            _clock.Advance(TimeSpan.FromSeconds(1));
            return (await Service().CreateAsync(articleId, userId, new ArticleCommentCreateDto(body, parentId, null), default)).Id;
        }

        var first = await Write("1", null);
        var second = await Write("2", null);
        var firstA = await Write("1a", first);
        var third = await Write("3", null);
        var firstAa = await Write("1a-a", firstA);
        var firstB = await Write("1b", first);

        var one = await Service().ListAsync(articleId, null, 1, 2, default);
        var two = await Service().ListAsync(articleId, null, 2, 2, default);
        var beyond = await Service().ListAsync(articleId, null, 3, 2, default);

        one.Items.Select(item => item.Id).Should().Equal(first, firstA, firstAa, firstB, second);
        two.Items.Select(item => item.Id).Should().Equal(third);
        beyond.Items.Should().BeEmpty();
        (one.Total, one.Threads, one.Page, one.PageSize).Should().Be((6, 3, 1, 2));
    }

    [Fact]
    public async Task GivenPerUserLimit_WhenAUserCommentsTooOften_ThenFurtherCommentsWaitForTheWindowWhileOthersMayStillWrite()
    {
        _options = new CommentOptions { PerUserLimit = 2, PerUserWindowSeconds = 600 };
        var articleId = await ArticleAsync();
        var userId = await UserAsync();
        var otherId = await UserAsync();
        await Service().CreateAsync(articleId, userId, new ArticleCommentCreateDto("1", null, null), default);
        _clock.Advance(TimeSpan.FromMinutes(1));
        await Service().CreateAsync(articleId, userId, new ArticleCommentCreateDto("2", null, null), default);

        var third = () => Service().CreateAsync(articleId, userId, new ArticleCommentCreateDto("3", null, null), default);

        var refused = (await third.Should().ThrowAsync<TooManyRequestsException>()).Which;
        (refused.Error.Code, refused.RetryAfter).Should().Be(("comment_limit_reached", (TimeSpan?)TimeSpan.FromMinutes(9)));
        await Service().CreateAsync(articleId, otherId, new ArticleCommentCreateDto("Другой", null, null), default);
        _clock.Advance(TimeSpan.FromMinutes(9));
        await third.Should().NotThrowAsync();
    }

    private ArticleCommentService Service() =>
        new(_db, _clock, Options.Create(_options), NullLogger<ArticleCommentService>.Instance);

    private async Task<int> UserAsync(UserRole role = UserRole.Reader, string? name = "Читатель", bool confirmed = true)
    {
        var user = new User
        {
            Email = $"{Guid.NewGuid():N}@mktba.test",
            Role = role,
            DisplayName = name,
            EmailConfirmedAtUtc = confirmed ? Now : null,
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user.Id;
    }

    private async Task<int> ArticleAsync(ArticleStatus status = ArticleStatus.Published, bool trashed = false)
    {
        var article = new Article
        {
            Title = "Намаз путника",
            Slug = $"a-{Guid.NewGuid():N}",
            Status = status,
            CreatedAt = Now,
            UpdatedAt = Now,
            DeletedAt = trashed ? Now : null,
        };
        _db.Articles.Add(article);
        await _db.SaveChangesAsync();
        return article.Id;
    }
}
