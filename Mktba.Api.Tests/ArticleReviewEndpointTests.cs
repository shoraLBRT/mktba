using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>
/// V-03 (#119): a scholar reviews the latest revision of a published article over HTTP. Who may call
/// the endpoints is <see cref="EndpointAuthorizationMatrixTests"/>; the rules in detail are the
/// application tests. Runs on both providers: on PostgreSQL the list's subqueries, the unique review
/// per scholar and revision, and the review with its audit entry in one save.
/// </summary>
public abstract class ArticleReviewEndpointTests
{
    private readonly MktbaApiFactory _factory;

    protected ArticleReviewEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenPublishedArticle_WhenAVerifiedScholarReviewsIt_ThenTheReviewIsTiedToTheRevisionAndLogged()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (scholar, scholarId) = await ScholarAsync("hanafi");
        var article = await PublishedArticleAsync(admin, $"Ревью {Guid.NewGuid():N}");

        var list = await scholar.GetFromJsonAsync<ArticleReviewArticlePageDto>(
            $"/article-reviews?q={Uri.EscapeDataString(article.Title)}", ApiJson.Options);
        list!.Items.Should().ContainSingle().Which.Should().Match<ArticleReviewArticleDto>(item =>
            item.ArticleId == article.Id && item.LatestRevisionNumber == 1 && item.MyLatestReview == null);
        var context = await scholar.GetFromJsonAsync<ArticleReviewContextDto>($"/article-reviews/{article.Id}", ApiJson.Options);
        (context!.Revision.Number, context.CanReview, context.Scope.Mazhab).Should().Be((1, true, "hanafi"));
        context.Scope.SchoolId.Should().NotBeNull();
        context.Revision.Snapshot.Paragraphs.Should().ContainSingle();

        var noComment = await scholar.PostAsJsonAsync($"/article-reviews/{article.Id}", new ArticleReviewCreateDto(1, ArticleReviewVerdict.HasErrors, null), ApiJson.Options);
        noComment.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(noComment)).Should().Be("article_review_comment_required");

        var reviewed = await scholar.PostAsJsonAsync(
            $"/article-reviews/{article.Id}", new ArticleReviewCreateDto(1, ArticleReviewVerdict.ConfirmedWithRemarks, "Уточнить источник."), ApiJson.Options);

        reviewed.StatusCode.Should().Be(HttpStatusCode.OK);
        var review = await reviewed.Content.ReadFromJsonAsync<ArticleReviewDto>(ApiJson.Options);
        (review!.RevisionNumber, review.Verdict, review.Mazhab, review.IsLatestRevision)
            .Should().Be((1, ArticleReviewVerdict.ConfirmedWithRemarks, "hanafi", true));
        var again = await scholar.PostAsJsonAsync($"/article-reviews/{article.Id}", new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), ApiJson.Options);
        again.StatusCode.Should().Be(HttpStatusCode.OK);
        var mine = await scholar.GetFromJsonAsync<ArticleReviewContextDto>($"/article-reviews/{article.Id}", ApiJson.Options);
        mine!.MyReviews.Should().ContainSingle().Which.Verdict.Should().Be(ArticleReviewVerdict.Confirmed);
        var log = await admin.GetFromJsonAsync<AuditLogPageDto>($"/audit-log?action=ArticleReviewed&actorId={scholarId}", ApiJson.Options);
        log!.Items.Select(entry => (entry.FromValue, entry.ToValue)).Should().BeEquivalentTo(new[]
        {
            ((string?)"ConfirmedWithRemarks", (string?)"Confirmed"),
            ((string?)null, (string?)"ConfirmedWithRemarks"),
        });
    }

    [Fact]
    public async Task GivenAnEditSinceTheScholarOpenedTheArticle_WhenTheyReviewTheOldRevision_ThenItIsRefusedWithTheLatestNumber()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (scholar, _) = await ScholarAsync(null);
        var article = await PublishedArticleAsync(admin, $"Правка {Guid.NewGuid():N}");
        var edit = article with
        {
            Paragraphs = [new ParagraphDto { Id = article.Paragraphs[0].Id, Order = 1, Opinions = [new OpinionDto { Content = "Новый текст", IsDefault = true }] }],
        };
        (await admin.PutAsJsonAsync($"/articles/{article.Id}/content", edit)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var stale = await scholar.PostAsJsonAsync($"/article-reviews/{article.Id}", new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), ApiJson.Options);

        stale.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ApiJson.ReadCodeAsync(stale)).Should().Be("article_review_revision_outdated");
    }

    [Fact]
    public async Task GivenAnAdminOrAnUnpublishedArticle_WhenReviewed_ThenTheAdminGetsNoVerdictAndTheDraftIsNotFound()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (scholar, _) = await ScholarAsync(null);
        var published = await PublishedArticleAsync(admin, $"Админ {Guid.NewGuid():N}");
        var draft = await CreateArticleAsync(admin, $"Черновик {Guid.NewGuid():N}");

        var asAdmin = await admin.GetFromJsonAsync<ArticleReviewContextDto>($"/article-reviews/{published.Id}", ApiJson.Options);
        asAdmin!.CanReview.Should().BeFalse();
        var adminVerdict = await admin.PostAsJsonAsync($"/article-reviews/{published.Id}", new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), ApiJson.Options);
        adminVerdict.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ApiJson.ReadCodeAsync(adminVerdict)).Should().Be("article_review_not_verified_scholar");

        var onDraft = await scholar.GetAsync($"/article-reviews/{draft.Id}");
        onDraft.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await ApiJson.ReadCodeAsync(onDraft)).Should().Be("article_not_found");
    }

    [Fact]
    public async Task GivenAReview_WhenAnonymousReadersAskForTheMarks_ThenTheyGetTheVerdictWithoutTheCommentAndAnEditMakesItPrevious()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (scholar, _) = await ScholarAsync("shafii");
        var article = await PublishedArticleAsync(admin, $"Виджет {Guid.NewGuid():N}");
        var anonymous = _factory.CreateClient();
        var before = await anonymous.GetFromJsonAsync<ArticleVerificationDto>($"/articles/{article.Id}/verification", ApiJson.Options);
        (before!.LatestRevisionNumber, before.Marks.Count).Should().Be(((int?)1, 0));
        (await scholar.PostAsJsonAsync(
            $"/article-reviews/{article.Id}", new ArticleReviewCreateDto(1, ArticleReviewVerdict.HasErrors, "Секретное замечание."), ApiJson.Options))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        var response = await anonymous.GetAsync($"/articles/{article.Id}/verification");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var json = await response.Content.ReadAsStringAsync();
        json.Should().NotContain("Секретное замечание").And.NotContain("@");
        var marks = System.Text.Json.JsonSerializer.Deserialize<ArticleVerificationDto>(json, ApiJson.Options)!;
        marks.Marks.Should().ContainSingle().Which.Should().Match<ArticleVerificationMarkDto>(mark =>
            mark.Verdict == ArticleReviewVerdict.HasErrors && mark.Mazhab == "shafii" && mark.RevisionNumber == 1
            && mark.IsLatestRevision && mark.ScholarName == null && mark.ScholarSlug == null);

        // V-05 (#121): an edit of the summary and the tags only is not substantial.
        var metadata = article with
        {
            Summary = "Кратко.",
            Tags = ["виджет"],
            Paragraphs = [new ParagraphDto { Id = article.Paragraphs[0].Id, Order = 1, Opinions = [new OpinionDto { Content = " Текст ", IsDefault = true }] }],
        };
        var metadataResponse = await admin.PutAsJsonAsync($"/articles/{article.Id}/content", metadata);
        metadataResponse.StatusCode.Should().Be(HttpStatusCode.NoContent, await metadataResponse.Content.ReadAsStringAsync());
        var kept = await anonymous.GetFromJsonAsync<ArticleVerificationDto>($"/articles/{article.Id}/verification", ApiJson.Options);
        (kept!.LatestRevisionNumber, kept.Marks.Single().IsLatestRevision, kept.Marks.Single().IsCurrent)
            .Should().Be(((int?)2, false, true));

        var edit = metadata with
        {
            Paragraphs = [new ParagraphDto { Id = article.Paragraphs[0].Id, Order = 1, Opinions = [new OpinionDto { Content = "Исправлено", IsDefault = true }] }],
        };
        (await admin.PutAsJsonAsync($"/articles/{article.Id}/content", edit)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        var after = await anonymous.GetFromJsonAsync<ArticleVerificationDto>($"/articles/{article.Id}/verification", ApiJson.Options);
        (after!.LatestRevisionNumber, after.Marks.Single().RevisionNumber, after.Marks.Single().IsLatestRevision, after.Marks.Single().IsCurrent)
            .Should().Be(((int?)3, 1, false, false));
        var list = await scholar.GetFromJsonAsync<ArticleReviewArticlePageDto>(
            $"/article-reviews?q={Uri.EscapeDataString(article.Title)}", ApiJson.Options);
        list!.NeedsReReviewTotal.Should().Be(1);
        list.Items.Single().MyLatestReview!.IsCurrent.Should().BeFalse();
    }

    [Fact]
    public async Task GivenAScholarsReviewAndRemark_WhenTheyOpenTheirCabinet_ThenTheQueueMatchesTheSpecializationAndTheHistoryListsBoth()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (scholar, _) = await ScholarAsync("hanafi");
        var stamp = Guid.NewGuid().ToString("N");
        var matching = await PublishedArticleAsync(admin, $"Фикх кабинет {stamp}");
        var other = await PublishedArticleAsync(admin, $"Кабинет {stamp}");

        var queue = await scholar.GetFromJsonAsync<ArticleReviewArticlePageDto>($"/article-reviews?queue=true&q={stamp}", ApiJson.Options);
        (queue!.Mazhab, queue.SpecializationKeywords.Single()).Should().Be(("hanafi", "фикх"));
        queue.Items.Select(item => (item.ArticleId, item.MatchesSpecialization, item.MatchesMazhab))
            .Should().Equal((matching.Id, true, false), (other.Id, false, false));

        (await scholar.PostAsJsonAsync($"/article-reviews/{matching.Id}", new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), ApiJson.Options))
            .StatusCode.Should().Be(HttpStatusCode.OK);
        var remarked = await scholar.PostAsJsonAsync(
            $"/articles/{other.Id}/remarks", new ArticleRemarkCreateDto(1, other.Paragraphs[0].Id, null, "Нужен источник."), ApiJson.Options);
        remarked.StatusCode.Should().Be(HttpStatusCode.OK);

        var after = await scholar.GetFromJsonAsync<ArticleReviewArticlePageDto>($"/article-reviews?queue=true&q={stamp}", ApiJson.Options);
        after!.Items.Select(item => item.ArticleId).Should().Equal(other.Id);
        var reviews = await scholar.GetFromJsonAsync<ScholarReviewHistoryPageDto>("/article-reviews/history", ApiJson.Options);
        reviews!.Items.Should().ContainSingle().Which.Should().Match<ScholarReviewHistoryItemDto>(item =>
            item.ArticleId == matching.Id && item.RevisionNumber == 1 && item.IsAvailable && item.IsCurrent && item.Verdict == ArticleReviewVerdict.Confirmed);
        var remarks = await scholar.GetFromJsonAsync<ScholarRemarkHistoryPageDto>("/article-remarks/mine?open=true", ApiJson.Options);
        remarks!.OpenTotal.Should().Be(1);
        remarks.Items.Should().ContainSingle().Which.Should().Match<ScholarRemarkHistoryItemDto>(item =>
            item.ArticleId == other.Id && item.Status == ArticleRemarkStatus.Open && item.MessageCount == 1 && item.Excerpt == "Текст");
        (await scholar.GetFromJsonAsync<ScholarRemarkHistoryPageDto>("/article-remarks/mine?open=false", ApiJson.Options))!.Total.Should().Be(0);
    }

    /// <summary>A Scholar with an approved application (the V-02 approval, written straight to the database).</summary>
    private async Task<(HttpClient Client, int UserId)> ScholarAsync(string? mazhab)
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
            Mazhab = mazhab,
            Status = ScholarApplicationStatus.Approved,
            SubmittedAt = now,
            ClosedAt = now,
            RoleBeforeApproval = UserRole.Reader,
        });
        await db.SaveChangesAsync();
        return (client, userId);
    }

    private static async Task<ArticleContentDto> PublishedArticleAsync(HttpClient admin, string title)
    {
        var article = await CreateArticleAsync(admin, title);
        await ApiJson.PublishAsync(admin, article.Id);
        return article;
    }

    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient admin, string title)
    {
        var dto = new ArticleContentCreateDto(
            title, null, [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
            null, null, null, null, null);
        var response = await admin.PostAsJsonAsync("/articles/content", dto);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
    }

    /// <summary>On the InMemory provider.</summary>
    public sealed class InMemory(MktbaApiFactory factory) : ArticleReviewEndpointTests(factory), IClassFixture<MktbaApiFactory>;

    /// <summary>On a real PostgreSQL database (X-07, #161).</summary>
    public sealed class OnPostgres(PostgresApiFactory factory) : ArticleReviewEndpointTests(factory), IClassFixture<PostgresApiFactory>;
}
