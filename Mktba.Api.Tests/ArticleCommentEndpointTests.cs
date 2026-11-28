using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>
/// C-01 (#127): readers' comments over HTTP — read by anyone, written, answered, edited and deleted by
/// signed-in users, kept when their author goes, gone with a purged article. Who may call the
/// endpoints is <see cref="EndpointAuthorizationMatrixTests"/>; the rules in detail are the
/// application tests. Runs on both providers: on PostgreSQL the foreign keys of the reply tree.
/// </summary>
public abstract class ArticleCommentEndpointTests
{
    private readonly MktbaApiFactory _factory;

    protected ArticleCommentEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenPublishedArticle_WhenReadersCommentReplyEditAndDelete_ThenAnonymousVisitorsSeeTheTreeWithNamesAndNoEmails()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (aisha, _) = await ReaderAsync("Аиша");
        var (umar, _) = await ReaderAsync("Умар");
        var articleId = await PublishedArticleAsync(author, admin);
        var anonymous = _factory.CreateClient();

        var created = await aisha.PostAsJsonAsync($"/articles/{articleId}/comments", new ArticleCommentCreateDto("Хорошая *статья*.", null, null), ApiJson.Options);
        created.StatusCode.Should().Be(HttpStatusCode.OK);
        var root = (await created.Content.ReadFromJsonAsync<ArticleCommentDto>(ApiJson.Options))!;
        var reply = await ReadAsync(await umar.PostAsJsonAsync(
            $"/articles/{articleId}/comments", new ArticleCommentCreateDto("Согласен.", root.Id, null), ApiJson.Options));
        var edited = await umar.PutAsJsonAsync($"/comments/{reply.Id}", new ArticleCommentUpdateDto("Согласен, спасибо."), ApiJson.Options);
        edited.StatusCode.Should().Be(HttpStatusCode.OK);
        (await aisha.PutAsJsonAsync($"/comments/{reply.Id}", new ArticleCommentUpdateDto("Чужое"), ApiJson.Options))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await anonymous.PostAsJsonAsync($"/articles/{articleId}/comments", new ArticleCommentCreateDto("Аноним", null, null), ApiJson.Options))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var response = await anonymous.GetAsync($"/articles/{articleId}/comments");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var json = await response.Content.ReadAsStringAsync();
        json.Should().NotContain("@mktba.test").And.NotContain("email\"");
        var page = (await response.Content.ReadFromJsonAsync<ArticleCommentPageDto>(ApiJson.Options))!;
        page.Items.Select(item => (item.AuthorName, item.Body, item.EditedAt is not null)).Should().Equal(
            ("Аиша", "Хорошая *статья*.", false), ("Умар", "Согласен, спасибо.", true));
        page.Viewer.Should().Be(new ArticleCommentViewerDto(false, ArticleCommentBlock.SignInRequired));

        (await admin.DeleteAsync($"/comments/{root.Id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        var forUmar = await umar.GetFromJsonAsync<ArticleCommentPageDto>($"/articles/{articleId}/comments", ApiJson.Options);
        forUmar!.Items.Select(item => (item.IsDeleted, item.IsMine)).Should().Equal((true, false), (false, true));
        forUmar.Viewer.CanComment.Should().BeTrue();
        var toDeleted = await umar.PostAsJsonAsync($"/articles/{articleId}/comments", new ArticleCommentCreateDto("Ещё", root.Id, null), ApiJson.Options);
        toDeleted.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ApiJson.ReadCodeAsync(toDeleted)).Should().Be("comment_deleted");
    }

    [Fact]
    public async Task GivenReportedComment_WhenModeratorsWorkTheQueuesAndBanTheAuthor_ThenReadersSeeTheOutcome()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (writer, writerId) = await ReaderAsync("Спорщик");
        var reporters = new[] { await ReaderAsync("Первый"), await ReaderAsync("Второй"), await ReaderAsync("Третий") };
        var articleId = await PublishedArticleAsync(author, admin);
        var comment = await ReadAsync(await writer.PostAsJsonAsync(
            $"/articles/{articleId}/comments", new ArticleCommentCreateDto("Резкое мнение", null, null), ApiJson.Options));

        (await writer.PostAsJsonAsync($"/comments/{comment.Id}/reports", new ArticleCommentReportCreateDto(ArticleCommentReportReason.Spam, null), ApiJson.Options))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await reporters[0].Client.PostAsJsonAsync($"/comments/{comment.Id}/reports", new ArticleCommentReportCreateDto(ArticleCommentReportReason.Abuse, "Грубо"), ApiJson.Options))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
        var reported = await admin.GetFromJsonAsync<CommentModerationPageDto>("/comments/moderation?queue=Reported", ApiJson.Options);
        reported!.Items.Should().ContainSingle(item => item.Id == comment.Id && item.Reports.Count == 1 && item.AuthorId == writerId);
        foreach (var (client, _) in reporters.Skip(1))
        {
            (await client.PostAsJsonAsync($"/comments/{comment.Id}/reports", new ArticleCommentReportCreateDto(ArticleCommentReportReason.Spam, null), ApiJson.Options))
                .StatusCode.Should().Be(HttpStatusCode.NoContent);
        }

        var anonymous = _factory.CreateClient();
        (await anonymous.GetFromJsonAsync<ArticleCommentPageDto>($"/articles/{articleId}/comments", ApiJson.Options))!.Items.Should().BeEmpty();
        var pending = await admin.GetFromJsonAsync<CommentModerationPageDto>("/comments/moderation", ApiJson.Options);
        pending!.Items.Should().Contain(item => item.Id == comment.Id && item.HoldReason == ArticleCommentHoldReason.Reported && item.Reports.Count == 3);

        (await admin.PostAsJsonAsync($"/comments/{comment.Id}/moderation", new CommentModerationDto(CommentModerationAction.Hide), ApiJson.Options))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
        var banned = await admin.PutAsJsonAsync($"/comments/bans/{writerId}", new CommentBanCreateDto(30, "Грубость"), ApiJson.Options);
        banned.StatusCode.Should().Be(HttpStatusCode.OK);

        var refused = await writer.PostAsJsonAsync($"/articles/{articleId}/comments", new ArticleCommentCreateDto("Ещё", null, null), ApiJson.Options);
        refused.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await ApiJson.ReadCodeAsync(refused)).Should().Be("comment_banned");
        var forWriter = await writer.GetFromJsonAsync<ArticleCommentPageDto>($"/articles/{articleId}/comments", ApiJson.Options);
        forWriter!.Viewer.Block.Should().Be(ArticleCommentBlock.Banned);
        forWriter.Items.Should().BeEmpty();
        (await admin.GetFromJsonAsync<List<CommentBanDto>>("/comments/bans", ApiJson.Options))!.Should().Contain(ban => ban.UserId == writerId && ban.Reason == "Грубость");
        (await admin.GetFromJsonAsync<CommentModerationPageDto>("/comments/moderation?queue=Hidden", ApiJson.Options))!
            .Items.Should().Contain(item => item.Id == comment.Id && item.AuthorBanned);

        (await admin.DeleteAsync($"/comments/bans/{writerId}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await admin.PostAsJsonAsync($"/comments/{comment.Id}/moderation", new CommentModerationDto(CommentModerationAction.Approve), ApiJson.Options))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await anonymous.GetFromJsonAsync<ArticleCommentPageDto>($"/articles/{articleId}/comments", ApiJson.Options))!
            .Items.Select(item => item.Body).Should().Equal("Резкое мнение");
        (await writer.PostAsJsonAsync($"/articles/{articleId}/comments", new ArticleCommentCreateDto("Исправлюсь", null, null), ApiJson.Options))
            .StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GivenReaderWithoutDisplayName_WhenCommenting_ThenItAnswersConflictAndNothingIsStored()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (reader, _) = await RoleClients.CreateAsync(_factory, UserRole.Reader);
        var articleId = await PublishedArticleAsync(author, admin);

        var response = await reader.PostAsJsonAsync($"/articles/{articleId}/comments", new ArticleCommentCreateDto("Текст", null, null), ApiJson.Options);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("comment_display_name_required");
        (await reader.GetFromJsonAsync<ArticleCommentPageDto>($"/articles/{articleId}/comments", ApiJson.Options))!
            .Should().Match<ArticleCommentPageDto>(page => page.Total == 0 && page.Viewer.Block == ArticleCommentBlock.DisplayNameRequired);
    }

    [Fact]
    public async Task GivenDraftArticle_WhenListingItsComments_ThenItAnswersNotFound()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var created = await author.PostAsJsonAsync("/articles", new ArticleCreateDto { Title = $"Черновик {Guid.NewGuid():N}" });
        var article = (await created.Content.ReadFromJsonAsync<ArticleReadDto>(ApiJson.Options))!;

        var response = await _factory.CreateClient().GetAsync($"/articles/{article.Id}/comments");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("article_not_found");
    }

    [Fact]
    public async Task GivenCommentTree_WhenItsAuthorIsDeletedAndThenTheArticleIsPurged_ThenTheTreeStaysWithoutTheNameAndThenGoesWithTheArticle()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (gone, goneId) = await ReaderAsync("Ушедший");
        var (stays, _) = await ReaderAsync("Оставшийся");
        var articleId = await PublishedArticleAsync(author, admin);
        var root = await ReadAsync(await gone.PostAsJsonAsync($"/articles/{articleId}/comments", new ArticleCommentCreateDto("Корень", null, null), ApiJson.Options));
        var reply = await ReadAsync(await stays.PostAsJsonAsync($"/articles/{articleId}/comments", new ArticleCommentCreateDto("Ответ", root.Id, null), ApiJson.Options));
        await ReadAsync(await gone.PostAsJsonAsync($"/articles/{articleId}/comments", new ArticleCommentCreateDto("Ответ на ответ", reply.Id, null), ApiJson.Options));
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
            db.Users.Remove(await db.Users.SingleAsync(user => user.Id == goneId));
            await db.SaveChangesAsync();
        }

        var page = await _factory.CreateClient().GetFromJsonAsync<ArticleCommentPageDto>($"/articles/{articleId}/comments", ApiJson.Options);
        page!.Items.Select(item => (item.Body, item.AuthorName)).Should().Equal(
            ("Корень", (string?)null), ("Ответ", "Оставшийся"), ("Ответ на ответ", (string?)null));

        (await admin.DeleteAsync($"/articles/{articleId}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await admin.DeleteAsync($"/articles/trash/{articleId}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await _factory.CreateClient().GetAsync($"/articles/{articleId}/comments")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    /// <summary>A reader with a confirmed address and a display name: one who may comment.</summary>
    private async Task<(HttpClient Client, int UserId)> ReaderAsync(string displayName)
    {
        var (client, userId) = await RoleClients.CreateAsync(_factory, UserRole.Reader);
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
        var user = await db.Users.SingleAsync(u => u.Id == userId);
        user.DisplayName = displayName;
        await db.SaveChangesAsync();
        return (client, userId);
    }

    private static async Task<ArticleCommentDto> ReadAsync(HttpResponseMessage response)
    {
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<ArticleCommentDto>(ApiJson.Options))!;
    }

    private static async Task<int> PublishedArticleAsync(HttpClient author, HttpClient admin)
    {
        var dto = new ArticleContentCreateDto(
            $"Комментарии {Guid.NewGuid():N}",
            null,
            [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Абзац.", true, [])] }],
            null, null, null, null, null);
        var response = await author.PostAsJsonAsync("/articles/content", dto);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
        await ApiJson.PublishAsync(admin, created.Id);
        return created.Id;
    }

    /// <summary>On the InMemory provider.</summary>
    public sealed class InMemory(MktbaApiFactory factory) : ArticleCommentEndpointTests(factory), IClassFixture<MktbaApiFactory>;

    /// <summary>On a real PostgreSQL database (X-07, #161).</summary>
    public sealed class OnPostgres(PostgresApiFactory factory) : ArticleCommentEndpointTests(factory), IClassFixture<PostgresApiFactory>;
}
