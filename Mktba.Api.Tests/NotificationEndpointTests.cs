using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Application.Services.Notifications;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>
/// V-09 (#125): notifications over HTTP — made by a verdict, a remark and a substantial edit through
/// the real services, read and marked read by their recipient, mailed through the outbox, and the
/// email choices. Runs on both providers: on PostgreSQL the outbox row and the foreign keys.
/// </summary>
public abstract class NotificationEndpointTests
{
    private readonly MktbaApiFactory _factory;

    protected NotificationEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenAVerdictAndARemark_WhenTheAuthorOpensTheirNotifications_ThenTheyAreCountedListedReadAndMailedToThem()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (author, authorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (scholar, _) = await ScholarAsync();
        var (stranger, _) = await RoleClients.CreateAsync(_factory, UserRole.Reader);
        var article = await PublishedArticleAsync(author, admin);

        (await scholar.PostAsJsonAsync($"/article-reviews/{article.Id}", new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), ApiJson.Options))
            .StatusCode.Should().Be(HttpStatusCode.OK);
        (await scholar.PostAsJsonAsync(
                $"/articles/{article.Id}/remarks",
                new ArticleRemarkCreateDto(1, article.Paragraphs.Single(p => p.Order == 1).Id, null, "Нужен источник."),
                ApiJson.Options))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        (await author.GetFromJsonAsync<NotificationUnreadCountDto>("/notifications/unread-count", ApiJson.Options))!.Unread.Should().Be(2);
        var page = (await author.GetFromJsonAsync<NotificationPageDto>("/notifications", ApiJson.Options))!;
        page.Items.Select(item => item.Type).Should().Equal(NotificationType.RemarkCreated, NotificationType.ArticleReviewed);
        page.Items.Should().OnlyContain(item => item.ArticleId == article.Id && item.Link == $"/admin/articles/{article.Id}/edit" && item.ReadAt == null);
        (page.Items[0].Excerpt, page.Items[1].Verdict).Should().Be(("Нужен источник.", (ArticleReviewVerdict?)ArticleReviewVerdict.Confirmed));
        (await stranger.GetFromJsonAsync<NotificationPageDto>("/notifications", ApiJson.Options))!.Total.Should().Be(0);
        var foreign = await stranger.PostAsync($"/notifications/{page.Items[0].Id}/read", null);
        foreign.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await ApiJson.ReadCodeAsync(foreign)).Should().Be("notification_not_found");

        (await author.PostAsync($"/notifications/{page.Items[0].Id}/read", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        var unread = (await author.GetFromJsonAsync<NotificationPageDto>("/notifications?unread=true", ApiJson.Options))!;
        (unread.Total, unread.Unread, unread.Items.Single().Type).Should().Be((1, 1, NotificationType.ArticleReviewed));
        (await author.PostAsync("/notifications/read-all", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await author.GetFromJsonAsync<NotificationUnreadCountDto>("/notifications/unread-count", ApiJson.Options))!.Unread.Should().Be(0);

        await SendEmailsAsync();
        var email = await EmailOfAsync(authorId);
        _factory.Emails.Sent.Where(message => message.To == email).Select(message => message.Subject)
            .Should().BeEquivalentTo("Учёный проверил вашу статью — mktba", "Новое замечание к вашей статье — mktba");
        _factory.Emails.Sent.Where(message => message.To == email).Should().OnlyContain(message => !message.TextBody.Contains("Нужен источник"));
    }

    [Fact]
    public async Task GivenAScholarsMark_WhenTheAuthorEditsTheTextItCovers_ThenTheScholarIsAskedToReReviewAndEmailedPerTheirChoice()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (scholar, scholarId) = await ScholarAsync();
        var article = await PublishedArticleAsync(author, admin);
        (await scholar.PostAsJsonAsync($"/article-reviews/{article.Id}", new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), ApiJson.Options))
            .StatusCode.Should().Be(HttpStatusCode.OK);
        var settings = await scholar.PutAsJsonAsync("/notifications/settings", new NotificationSettingsWriteDto(true, false, true), ApiJson.Options);
        settings.StatusCode.Should().Be(HttpStatusCode.OK);
        (await settings.Content.ReadFromJsonAsync<NotificationSettingsDto>(ApiJson.Options))
            .Should().Be(new NotificationSettingsDto(true, false, true, false));

        var first = article.Paragraphs.Single(p => p.Order == 1);
        var edit = article with
        {
            Paragraphs =
            [
                new ParagraphDto { Id = first.Id, Order = 1, Opinions = [new OpinionDto { Id = first.Opinions[0].Id, Content = "Первый абзац, исправленный.", IsDefault = true }] },
                article.Paragraphs.Single(p => p.Order == 2),
            ],
        };
        (await author.PutAsJsonAsync($"/articles/{article.Id}/content", edit)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await author.PutAsJsonAsync($"/articles/{article.Id}/content", edit with { Title = edit.Title + " 2" }))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);

        var requests = (await scholar.GetFromJsonAsync<NotificationPageDto>("/notifications", ApiJson.Options))!.Items;
        requests.Should().ContainSingle().Which.Should().Match<NotificationDto>(item =>
            item.Type == NotificationType.ReReviewRequested && item.Link == $"/admin/article-reviews/{article.Id}" && item.ArticleId == article.Id);
        (await scholar.GetFromJsonAsync<NotificationSettingsDto>("/notifications/settings", ApiJson.Options))!.EmailArticleReviews.Should().BeFalse();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
        (await db.Notifications.AsNoTracking().Where(n => n.UserId == scholarId).AnyAsync(n => n.Email != null)).Should().BeFalse();
    }

    private async Task SendEmailsAsync()
    {
        using var scope = _factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<NotificationEmailService>().SendDueAsync();
    }

    private async Task<string> EmailOfAsync(int userId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
        return await db.Users.AsNoTracking().Where(user => user.Id == userId).Select(user => user.Email).SingleAsync();
    }

    /// <summary>A Scholar with an approved application (the V-02 approval, written straight to the database).</summary>
    private async Task<(HttpClient Client, int UserId)> ScholarAsync()
    {
        var (client, userId) = await RoleClients.CreateAsync(_factory, UserRole.Scholar);
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
        var now = DateTime.UtcNow;
        db.ScholarApplications.Add(new ScholarApplication
        {
            UserId = userId,
            Degree = "Доктор наук",
            Institution = "Университет",
            Specialization = "Фикх",
            Status = ScholarApplicationStatus.Approved,
            SubmittedAt = now,
            ClosedAt = now,
            RoleBeforeApproval = UserRole.Reader,
        });
        await db.SaveChangesAsync();
        return (client, userId);
    }

    /// <summary>An author's article of two paragraphs, published by an admin; the content as the editor reads it.</summary>
    private static async Task<ArticleContentDto> PublishedArticleAsync(HttpClient author, HttpClient admin)
    {
        var dto = new ArticleContentCreateDto(
            $"Уведомления {Guid.NewGuid():N}",
            null,
            [
                new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Первый абзац.", true, [])] },
                new ParagraphCreateDto { Order = 2, Opinions = [new OpinionCreateDto("Второй абзац.", true, [])] },
            ],
            null, null, null, null, null);
        var response = await author.PostAsJsonAsync("/articles/content", dto);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
        await ApiJson.PublishAsync(admin, created.Id);
        return (await author.GetFromJsonAsync<ArticleContentDto>($"/articles/{created.Id}/content", ApiJson.Options))!;
    }

    /// <summary>On the InMemory provider.</summary>
    public sealed class InMemory(MktbaApiFactory factory) : NotificationEndpointTests(factory), IClassFixture<MktbaApiFactory>;

    /// <summary>On PostgreSQL.</summary>
    public sealed class OnPostgres(PostgresApiFactory factory) : NotificationEndpointTests(factory), IClassFixture<PostgresApiFactory>;
}
