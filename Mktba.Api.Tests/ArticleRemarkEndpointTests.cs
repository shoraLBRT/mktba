using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>
/// V-06 (#122): a scholar's remark on a block over HTTP — made from the review page's revision,
/// answered, closed and reopened, and kept when its block is deleted. Who may call the endpoints is
/// <see cref="EndpointAuthorizationMatrixTests"/>; the rules in detail are the application tests.
/// Runs on both providers: on PostgreSQL the foreign keys that let a block go while its remark stays.
/// </summary>
public abstract class ArticleRemarkEndpointTests
{
    private readonly MktbaApiFactory _factory;

    protected ArticleRemarkEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenPublishedArticle_WhenAScholarRemarksOnAParagraph_ThenTheAuthorAnswersAndResolvesItAndTheScholarReopensIt()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (scholar, scholarId) = await ScholarAsync();
        var (reader, _) = await RoleClients.CreateAsync(_factory, UserRole.Reader);
        var article = await PublishedArticleAsync(author, admin);

        var context = await scholar.GetFromJsonAsync<ArticleReviewContextDto>($"/article-reviews/{article.Id}", ApiJson.Options);
        var second = context!.Revision.Snapshot.Paragraphs.Single(p => p.Order == 2);
        second.Id.Should().Be(article.Paragraphs.Single(p => p.Order == 2).Id);
        var created = await scholar.PostAsJsonAsync(
            $"/articles/{article.Id}/remarks", new ArticleRemarkCreateDto(context.Revision.Number, second.Id!.Value, null, "Нужен источник."), ApiJson.Options);
        created.StatusCode.Should().Be(HttpStatusCode.OK);
        var remark = (await created.Content.ReadFromJsonAsync<ArticleRemarkDto>(ApiJson.Options))!;
        (remark.Excerpt, remark.Status, remark.ParagraphOrder).Should().Be(("Второй абзац.", ArticleRemarkStatus.Open, 2));

        var forAuthor = await author.GetFromJsonAsync<ArticleRemarkListDto>($"/articles/{article.Id}/remarks", ApiJson.Options);
        forAuthor!.Items.Should().ContainSingle().Which.CanClose.Should().BeTrue();
        (await reader.GetAsync($"/articles/{article.Id}/remarks")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        var scholarClose = await scholar.PostAsJsonAsync(
            $"/article-remarks/{remark.Id}/close", new ArticleRemarkCloseDto(ArticleRemarkStatus.Resolved, null), ApiJson.Options);
        scholarClose.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await author.PostAsJsonAsync($"/article-remarks/{remark.Id}/messages", new ArticleRemarkReplyDto("Добавлю."), ApiJson.Options))
            .StatusCode.Should().Be(HttpStatusCode.OK);
        var closed = await author.PostAsJsonAsync(
            $"/article-remarks/{remark.Id}/close", new ArticleRemarkCloseDto(ArticleRemarkStatus.Resolved, "Готово."), ApiJson.Options);
        closed.StatusCode.Should().Be(HttpStatusCode.OK);
        (await closed.Content.ReadFromJsonAsync<ArticleRemarkDto>(ApiJson.Options))!.Status.Should().Be(ArticleRemarkStatus.Resolved);
        var lateReply = await scholar.PostAsJsonAsync($"/article-remarks/{remark.Id}/messages", new ArticleRemarkReplyDto("Ещё"), ApiJson.Options);
        lateReply.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ApiJson.ReadCodeAsync(lateReply)).Should().Be("article_remark_closed");

        var reopened = await scholar.PostAsJsonAsync($"/article-remarks/{remark.Id}/reopen", new ArticleRemarkReopenDto("Источник не тот."), ApiJson.Options);

        reopened.StatusCode.Should().Be(HttpStatusCode.OK);
        var thread = (await reopened.Content.ReadFromJsonAsync<ArticleRemarkDto>(ApiJson.Options))!;
        thread.Status.Should().Be(ArticleRemarkStatus.Open);
        thread.Messages.Select(message => message.Body).Should().Equal("Нужен источник.", "Добавлю.", "Готово.", "Источник не тот.");
        var log = await admin.GetFromJsonAsync<AuditLogPageDto>($"/audit-log?articleId={article.Id}", ApiJson.Options);
        log!.Items.Where(entry => entry.Action is AuditAction.ArticleRemarkCreated or AuditAction.ArticleRemarkClosed or AuditAction.ArticleRemarkReopened)
            .Select(entry => entry.Action)
            .Should().BeEquivalentTo([AuditAction.ArticleRemarkCreated, AuditAction.ArticleRemarkClosed, AuditAction.ArticleRemarkReopened]);
    }

    [Fact]
    public async Task GivenARemarkedParagraph_WhenTheAuthorDeletesItAndKeepsTheOther_ThenTheSaveSucceedsAndTheRemarkStaysAsBlockRemoved()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (scholar, _) = await ScholarAsync();
        var article = await PublishedArticleAsync(author, admin);
        var first = article.Paragraphs.Single(p => p.Order == 1);
        var second = article.Paragraphs.Single(p => p.Order == 2);
        foreach (var paragraph in new[] { first, second })
        {
            (await scholar.PostAsJsonAsync(
                $"/articles/{article.Id}/remarks", new ArticleRemarkCreateDto(1, paragraph.Id, null, "Замечание."), ApiJson.Options))
                .StatusCode.Should().Be(HttpStatusCode.OK);
        }

        var edit = article with
        {
            Paragraphs = [new ParagraphDto { Id = first.Id, Order = 1, Opinions = [new OpinionDto { Id = first.Opinions[0].Id, Content = "Первый абзац, исправленный.", IsDefault = true }] }],
        };
        (await author.PutAsJsonAsync($"/articles/{article.Id}/content", edit)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var items = (await author.GetFromJsonAsync<ArticleRemarkListDto>($"/articles/{article.Id}/remarks", ApiJson.Options))!.Items;
        items.Select(item => (item.ParagraphOrder, item.BlockRemoved, item.ParagraphId, item.CurrentParagraphOrder)).Should().BeEquivalentTo(new[]
        {
            (1, false, (int?)first.Id, (int?)1),
            (2, true, (int?)null, (int?)null),
        });
        var stale = await scholar.PostAsJsonAsync(
            $"/articles/{article.Id}/remarks", new ArticleRemarkCreateDto(1, first.Id, null, "Ещё."), ApiJson.Options);
        stale.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ApiJson.ReadCodeAsync(stale)).Should().Be("article_review_revision_outdated");
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
            $"Замечания {Guid.NewGuid():N}",
            null,
            [
                new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Первый абзац.", true, [])] },
                new ParagraphCreateDto { Order = 2, Opinions = [new OpinionCreateDto("<p>Второй абзац.</p>", true, [])] },
            ],
            null, null, null, null, null);
        var response = await author.PostAsJsonAsync("/articles/content", dto);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
        await ApiJson.PublishAsync(admin, created.Id);
        return (await author.GetFromJsonAsync<ArticleContentDto>($"/articles/{created.Id}/content", ApiJson.Options))!;
    }

    /// <summary>On the InMemory provider.</summary>
    public sealed class InMemory(MktbaApiFactory factory) : ArticleRemarkEndpointTests(factory), IClassFixture<MktbaApiFactory>;

    /// <summary>On a real PostgreSQL database (X-07, #161).</summary>
    public sealed class OnPostgres(PostgresApiFactory factory) : ArticleRemarkEndpointTests(factory), IClassFixture<PostgresApiFactory>;
}
