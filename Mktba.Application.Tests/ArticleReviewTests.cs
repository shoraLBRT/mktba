using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Application.Services.Verification;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>V-03 (#119): a verified scholar reviews the latest revision of a published article.</summary>
public sealed class ArticleReviewTests : IDisposable
{
    private static readonly DateTime Now = new(2026, 11, 26, 10, 0, 0, DateTimeKind.Utc);

    private readonly MktbaDbContext _db;
    private readonly FeedbackTests.FakeClock _clock = new(Now);

    public ArticleReviewTests()
    {
        _db = new MktbaDbContext(new DbContextOptionsBuilder<MktbaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        _db.Database.EnsureCreated();
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task GivenVerifiedScholar_WhenTheyConfirmTheLatestRevision_ThenTheReviewAndItsAuditEntryAreStored()
    {
        var scholarId = await ScholarAsync(mazhab: null);
        var articleId = await ArticleAsync("Намаз", revisions: 2);

        var review = await Service().ReviewAsync(articleId, scholarId, new ArticleReviewCreateDto(2, ArticleReviewVerdict.Confirmed, "  "), default);

        (review.RevisionNumber, review.Verdict, review.Comment, review.Mazhab, review.IsLatestRevision)
            .Should().Be((2, ArticleReviewVerdict.Confirmed, (string?)null, (string?)null, true));
        (review.CreatedAt, review.UpdatedAt).Should().Be((Now, Now));
        var stored = await _db.ArticleReviews.AsNoTracking().Include(r => r.Revision).SingleAsync();
        (stored.ArticleId, stored.Revision.Number, stored.ScholarId).Should().Be((articleId, 2, scholarId));
        var entry = await _db.AuditLogEntries.AsNoTracking().SingleAsync();
        (entry.Action, entry.ActorId, entry.ArticleId, entry.ArticleTitle, entry.FromValue, entry.ToValue)
            .Should().Be((AuditAction.ArticleReviewed, (int?)scholarId, (int?)articleId, "Намаз", (string?)null, "Confirmed"));
    }

    [Fact]
    public async Task GivenAReviewOfARevision_WhenTheScholarReviewsItAgain_ThenTheVerdictIsReplacedAndLoggedWithTheOldOne()
    {
        var scholarId = await ScholarAsync(mazhab: null);
        var articleId = await ArticleAsync("Пост", revisions: 1);
        var first = await Service().ReviewAsync(articleId, scholarId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);
        _clock.Advance(TimeSpan.FromHours(1));

        var second = await Service().ReviewAsync(
            articleId, scholarId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.HasErrors, "Абзац 2:\r\nневерная ссылка.  "), default);

        second.Id.Should().Be(first.Id);
        (second.Verdict, second.Comment, second.CreatedAt, second.UpdatedAt)
            .Should().Be((ArticleReviewVerdict.HasErrors, "Абзац 2:\nневерная ссылка.", Now, Now.AddHours(1)));
        (await _db.ArticleReviews.CountAsync()).Should().Be(1);
        var last = await _db.AuditLogEntries.AsNoTracking().OrderBy(e => e.Id).LastAsync();
        (last.FromValue, last.ToValue).Should().Be(("Confirmed", "HasErrors"));
    }

    [Fact]
    public async Task GivenAnEditAfterTheReview_WhenTheScholarReviewsTheNewRevision_ThenBothStayAndOnlyTheNewIsTheLatest()
    {
        var scholarId = await ScholarAsync(mazhab: null);
        var articleId = await ArticleAsync("Закят", revisions: 1);
        await Service().ReviewAsync(articleId, scholarId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);
        await AddRevisionAsync(articleId, 2);

        var outdated = () => Service().ReviewAsync(articleId, scholarId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);
        var error = (await outdated.Should().ThrowAsync<ConflictException>()).Which.Error;
        (error.Code, error.Params!["latest"]).Should().Be(("article_review_revision_outdated", (object?)2));

        await Service().ReviewAsync(articleId, scholarId, new ArticleReviewCreateDto(2, ArticleReviewVerdict.ConfirmedWithRemarks, "Уточнить источник."), default);

        var context = await Service().GetAsync(articleId, scholarId, default);
        context.Revision.Number.Should().Be(2);
        context.MyReviews.Select(r => (r.RevisionNumber, r.Verdict, r.IsLatestRevision)).Should().Equal(
            (2, ArticleReviewVerdict.ConfirmedWithRemarks, true),
            (1, ArticleReviewVerdict.Confirmed, false));
    }

    [Theory]
    [InlineData(ArticleReviewVerdict.ConfirmedWithRemarks)]
    [InlineData(ArticleReviewVerdict.HasErrors)]
    public async Task GivenAVerdictThatNeedsAComment_WhenGivenWithoutOne_ThenItIsRefused(ArticleReviewVerdict verdict)
    {
        var scholarId = await ScholarAsync(mazhab: null);
        var articleId = await ArticleAsync("Хадж", revisions: 1);

        var act = () => Service().ReviewAsync(articleId, scholarId, new ArticleReviewCreateDto(1, verdict, " \n "), default);

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_review_comment_required");
        (await _db.ArticleReviews.AnyAsync()).Should().BeFalse();
        (await _db.AuditLogEntries.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task GivenATooLongCommentOrAnUnknownVerdict_WhenReviewed_ThenItIsRefused()
    {
        var scholarId = await ScholarAsync(mazhab: null);
        var articleId = await ArticleAsync("Ид", revisions: 1);

        var tooLong = () => Service().ReviewAsync(
            articleId, scholarId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.HasErrors, new string('а', ArticleReview.CommentMaxLength + 1)), default);
        var unknown = () => Service().ReviewAsync(articleId, scholarId, new ArticleReviewCreateDto(1, (ArticleReviewVerdict)99, null), default);

        (await tooLong.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_review_comment_too_long");
        (await unknown.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_review_verdict_invalid");
    }

    [Fact]
    public async Task GivenAScholarWithAMadhab_WhenTheyOpenAndReview_ThenTheReviewIsScopedToTheirSchool()
    {
        var hanafi = new School { Slug = "hanafi", Name = "Ханафитский мазхаб", ShortName = "Хан", IsSystem = true };
        _db.Schools.Add(hanafi);
        await _db.SaveChangesAsync();
        var scholarId = await ScholarAsync(mazhab: "hanafi");
        var articleId = await ArticleAsync("Вуду", revisions: 1);

        var context = await Service().GetAsync(articleId, scholarId, default);
        var review = await Service().ReviewAsync(articleId, scholarId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);

        context.Scope.Should().Be(new ArticleReviewScopeDto("hanafi", hanafi.Id));
        context.CanReview.Should().BeTrue();
        review.Mazhab.Should().Be("hanafi");
    }

    [Fact]
    public async Task GivenAScholarRoleWithoutAnApprovedApplication_WhenTheyReview_ThenTheyMayReadButNotGiveAVerdict()
    {
        var byHandId = await UserAsync(UserRole.Scholar);
        var revokedId = await ScholarAsync(mazhab: null);
        var application = await _db.ScholarApplications.SingleAsync(a => a.UserId == revokedId);
        application.Status = ScholarApplicationStatus.Revoked;
        var adminId = await UserAsync(UserRole.Admin);
        var articleId = await ArticleAsync("Сунна", revisions: 1);

        foreach (var userId in new[] { byHandId, revokedId, adminId })
        {
            (await Service().GetAsync(articleId, userId, default)).CanReview.Should().BeFalse();
            var act = () => Service().ReviewAsync(articleId, userId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);
            (await act.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("article_review_not_verified_scholar");
        }
    }

    [Theory]
    [InlineData(ArticleStatus.Draft, false)]
    [InlineData(ArticleStatus.InReview, false)]
    [InlineData(ArticleStatus.Archived, false)]
    [InlineData(ArticleStatus.Published, true)]
    public async Task GivenAnArticleThatReadersDoNotSee_WhenOpenedForReview_ThenItIsNotFound(ArticleStatus status, bool trashed)
    {
        var scholarId = await ScholarAsync(mazhab: null);
        var articleId = await ArticleAsync("Скрытая", revisions: 1, status);
        if (trashed)
        {
            var article = await _db.Articles.SingleAsync(a => a.Id == articleId);
            article.DeletedAt = Now;
            await _db.SaveChangesAsync();
        }

        var open = () => Service().GetAsync(articleId, scholarId, default);
        var review = () => Service().ReviewAsync(articleId, scholarId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);

        (await open.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("article_not_found");
        (await review.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("article_not_found");
        (await Service().ListAsync(scholarId, null, false, 1, 20, default)).Items.Should().BeEmpty();
    }

    [Fact]
    public async Task GivenPublishedArticles_WhenListed_ThenTheUnreviewedComeBeforeTheReviewedWithTheCallersLatestReview()
    {
        var scholarId = await ScholarAsync(mazhab: null);
        var otherId = await ScholarAsync(mazhab: null);
        var older = await ArticleAsync("Пост в Рамадан", revisions: 1);
        _clock.Advance(TimeSpan.FromMinutes(1));
        var newer = await ArticleAsync("Намаз путника", revisions: 2);
        _clock.Advance(TimeSpan.FromMinutes(1));
        await ArticleAsync("Без ревизий", revisions: 0);
        await Service().ReviewAsync(newer, scholarId, new ArticleReviewCreateDto(2, ArticleReviewVerdict.HasErrors, "Ошибка."), default);
        await Service().ReviewAsync(older, otherId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);

        var page = await Service().ListAsync(scholarId, null, false, 1, 20, default);

        (page.Total, page.NeedsReReviewTotal).Should().Be((2, 0));
        page.Items.Select(item => (item.ArticleId, item.LatestRevisionNumber)).Should().Equal((older, 1), (newer, 2));
        page.Items[0].MyLatestReview.Should().BeNull();
        page.Items[1].MyLatestReview.Should().Be(new ArticleReviewMarkDto(2, ArticleReviewVerdict.HasErrors, Now.AddMinutes(2), true));
        (await Service().ListAsync(scholarId, "ПУТНИКА", false, 1, 20, default)).Items.Select(item => item.ArticleId).Should().Equal(newer);
        var queue = await Service().ListAsync(scholarId, null, true, 1, 20, default);
        (queue.Total, queue.Items.Single().ArticleId).Should().Be((1, older));
        var clamped = await Service().ListAsync(scholarId, null, false, 0, 1000, default);
        (clamped.Page, clamped.PageSize).Should().Be((1, ArticleReviewService.MaxPageSize));
        var second = await Service().ListAsync(scholarId, null, false, 2, 1, default);
        (second.Total, second.Items.Single().ArticleId).Should().Be((2, newer));
    }

    [Fact]
    public async Task GivenAScholarsSpecializationAndMadhab_WhenTheQueueIsListed_ThenMatchingUnreviewedArticlesComeFirst()
    {
        var hanafi = await SchoolAsync("hanafi");
        var scholarId = await ScholarAsync(mazhab: "hanafi", specialization: "Исламские науки, хадисоведение");
        var section = await ArticleAsync("Хадисоведение: сборники", revisions: 1);
        _clock.Advance(TimeSpan.FromMinutes(1));
        var underSection = await ArticleAsync("Сахих аль-Бухари", revisions: 1);
        (await _db.Articles.SingleAsync(article => article.Id == underSection)).ParentArticleId = section;
        _clock.Advance(TimeSpan.FromMinutes(1));
        var byTag = await ArticleAsync("Пост", revisions: 1);
        await TagAsync(byTag, "Хадисы");
        _clock.Advance(TimeSpan.FromMinutes(1));
        var both = await ArticleAsync("Намаз", revisions: 1);
        await TagAsync(both, "Хадисы");
        await OpinionAsync(both, hanafi);
        _clock.Advance(TimeSpan.FromMinutes(1));
        var byMazhab = await ArticleAsync("Закят", revisions: 1);
        await OpinionAsync(byMazhab, hanafi);
        _clock.Advance(TimeSpan.FromMinutes(1));
        var plain = await ArticleAsync("Хадж", revisions: 1);
        _clock.Advance(TimeSpan.FromMinutes(1));
        var reviewed = await ArticleAsync("Хадисы о намазе", revisions: 1);
        await Service().ReviewAsync(reviewed, scholarId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);

        var page = await Service().ListAsync(scholarId, null, false, 1, 20, default);

        page.Mazhab.Should().Be("hanafi");
        page.SpecializationKeywords.Should().Equal("хадисоведение");
        page.Items.Select(item => (item.ArticleId, item.MatchesSpecialization, item.MatchesMazhab)).Should().Equal(
            (both, true, true),
            (byTag, true, false),
            (underSection, true, false),
            (section, true, false),
            (byMazhab, false, true),
            (plain, false, false),
            (reviewed, true, false));
        (await Service().ListAsync(scholarId, null, true, 1, 20, default)).Items.Select(item => item.ArticleId)
            .Should().NotContain(reviewed).And.HaveCount(6);
    }

    [Fact]
    public async Task GivenReviewsOnSeveralArticles_WhenTheScholarOpensTheirHistory_ThenEveryVerdictIsListedLatestFirstWithWhetherItIsCurrent()
    {
        var scholarId = await ScholarAsync(mazhab: null);
        var otherId = await ScholarAsync(mazhab: null);
        var edited = await ArticleAsync("Пост", revisions: 1);
        var archived = await ArticleAsync("Закят", revisions: 1);
        var trashed = await ArticleAsync("Хадж", revisions: 1);
        await Service().ReviewAsync(edited, scholarId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);
        await Service().ReviewAsync(trashed, scholarId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);
        await Service().ReviewAsync(edited, otherId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);
        await AddRevisionAsync(edited, 2);
        _clock.Advance(TimeSpan.FromHours(1));
        await Service().ReviewAsync(archived, scholarId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.HasErrors, "Ошибка."), default);
        (await _db.Articles.SingleAsync(article => article.Id == archived)).Status = ArticleStatus.Archived;
        (await _db.Articles.SingleAsync(article => article.Id == trashed)).DeletedAt = Now;
        await _db.SaveChangesAsync();

        var history = await Service().ListHistoryAsync(scholarId, 1, 20, default);

        history.Total.Should().Be(2);
        history.Items.Select(item => (item.ArticleId, item.Title, item.IsAvailable, item.RevisionNumber, item.LatestRevisionNumber, item.Verdict, item.IsLatestRevision, item.IsCurrent))
            .Should().Equal(
                (archived, "Закят", false, 1, 1, ArticleReviewVerdict.HasErrors, true, true),
                (edited, "Пост", true, 1, 2, ArticleReviewVerdict.Confirmed, false, false));
        (history.Items[0].Comment, history.Items[0].UpdatedAt).Should().Be(("Ошибка.", Now.AddHours(1)));

        _clock.Advance(TimeSpan.FromHours(1));
        await Service().ReviewAsync(edited, scholarId, new ArticleReviewCreateDto(2, ArticleReviewVerdict.Confirmed, null), default);

        var after = await Service().ListHistoryAsync(scholarId, 1, 2, default);
        (after.Total, after.PageSize).Should().Be((3, 2));
        after.Items.Select(item => (item.ArticleId, item.RevisionNumber, item.IsCurrent)).Should().Equal((edited, 2, true), (archived, 1, true));
    }

    [Fact]
    public async Task GivenMarksOfSeveralScholars_WhenReadersAskForThem_ThenEachVerifiedScholarsLatestMarkIsShownNewestRevisionFirst()
    {
        var articleId = await ArticleAsync("Пост", revisions: 1);
        var named = await ScholarAsync(mazhab: null);
        await NameAsync(named, "Абдулла Ибрагимов", "abdulla");
        var authorOf = await ArticleAsync("Его статья", revisions: 1);
        (await _db.Articles.SingleAsync(article => article.Id == authorOf)).AuthorId = named;
        var nameless = await ScholarAsync(mazhab: "hanafi");
        var earlier = await ScholarAsync(mazhab: null);
        await NameAsync(earlier, "Юсуф Карими", "yusuf");
        var revoked = await ScholarAsync(mazhab: null);
        await _db.SaveChangesAsync();

        await Service().ReviewAsync(articleId, named, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);
        await Service().ReviewAsync(articleId, earlier, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);
        await Service().ReviewAsync(articleId, revoked, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);
        await AddRevisionAsync(articleId, 2);
        _clock.Advance(TimeSpan.FromHours(1));
        await Service().ReviewAsync(articleId, nameless, new ArticleReviewCreateDto(2, ArticleReviewVerdict.HasErrors, "Абзац 3."), default);
        _clock.Advance(TimeSpan.FromHours(1));
        await Service().ReviewAsync(articleId, named, new ArticleReviewCreateDto(2, ArticleReviewVerdict.ConfirmedWithRemarks, "Источник."), default);
        (await _db.Users.SingleAsync(user => user.Id == revoked)).Role = UserRole.Reader;
        (await _db.ScholarApplications.SingleAsync(application => application.UserId == revoked)).Status = ScholarApplicationStatus.Revoked;
        await _db.SaveChangesAsync();

        var verification = await Service().GetVerificationAsync(articleId, default);

        verification.LatestRevisionNumber.Should().Be(2);
        verification.Marks.Select(mark => (mark.ScholarName, mark.ScholarSlug, mark.Verdict, mark.Mazhab, mark.RevisionNumber, mark.ReviewedAt, mark.IsLatestRevision, mark.IsCurrent))
            .Should().Equal(
                ("Абдулла Ибрагимов", "abdulla", ArticleReviewVerdict.ConfirmedWithRemarks, (string?)null, 2, Now.AddHours(2), true, true),
                ((string?)null, (string?)null, ArticleReviewVerdict.HasErrors, "hanafi", 2, Now.AddHours(1), true, true),
                ("Юсуф Карими", (string?)null, ArticleReviewVerdict.Confirmed, (string?)null, 1, Now, false, false));
    }

    [Theory]
    [InlineData(ArticleStatus.Draft, false)]
    [InlineData(ArticleStatus.Published, true)]
    public async Task GivenAnArticleThatReadersDoNotSee_WhenReadersAskForItsMarks_ThenThereAreNone(ArticleStatus status, bool trashed)
    {
        var scholarId = await ScholarAsync(mazhab: null);
        var articleId = await ArticleAsync("Ид", revisions: 1);
        await Service().ReviewAsync(articleId, scholarId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);
        var article = await _db.Articles.SingleAsync(a => a.Id == articleId);
        article.Status = status;
        article.DeletedAt = trashed ? Now : null;
        await _db.SaveChangesAsync();

        var hidden = await Service().GetVerificationAsync(articleId, default);
        var unknown = await Service().GetVerificationAsync(articleId + 100, default);

        (hidden.LatestRevisionNumber, hidden.Marks.Count).Should().Be(((int?)null, 0));
        (unknown.LatestRevisionNumber, unknown.Marks.Count).Should().Be(((int?)null, 0));
    }

    [Fact]
    public async Task GivenAnEditOfTheTagsOnly_WhenReadersAndTheScholarLookAtTheMark_ThenItIsStillCurrentAndNoReReviewIsAsked()
    {
        var scholarId = await ScholarAsync(mazhab: null);
        var articleId = await ArticleAsync("Хадж", revisions: 0);
        await AddRevisionAsync(articleId, 1, Snapshot("Текст", tags: ["хадж"]));
        await Service().ReviewAsync(articleId, scholarId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);
        await AddRevisionAsync(articleId, 2, Snapshot("Текст", tags: ["хадж", "умра"], summary: "Кратко"));

        var mark = (await Service().GetVerificationAsync(articleId, default)).Marks.Single();
        var mine = (await Service().GetAsync(articleId, scholarId, default)).MyReviews.Single();
        var page = await Service().ListAsync(scholarId, null, false, 1, 20, default);

        (mark.RevisionNumber, mark.IsLatestRevision, mark.IsCurrent).Should().Be((1, false, true));
        (mine.IsLatestRevision, mine.IsCurrent).Should().Be((false, true));
        page.NeedsReReviewTotal.Should().Be(0);
        page.Items.Single().MyLatestReview!.IsCurrent.Should().BeTrue();
        // A current mark may still be given again on the latest revision: it becomes the scholar's latest.
        var again = await Service().ReviewAsync(articleId, scholarId, new ArticleReviewCreateDto(2, ArticleReviewVerdict.Confirmed, null), default);
        (again.RevisionNumber, again.IsCurrent).Should().Be((2, true));
    }

    [Fact]
    public async Task GivenASubstantialEditAfterTheReview_WhenTheScholarListsArticles_ThenTheArticleComesFirstAsNeedingAReReview()
    {
        var scholarId = await ScholarAsync(mazhab: null);
        var edited = await ArticleAsync("Пост", revisions: 1);
        await Service().ReviewAsync(edited, scholarId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);
        _clock.Advance(TimeSpan.FromMinutes(1));
        var untouched = await ArticleAsync("Закят", revisions: 1);
        await Service().ReviewAsync(untouched, scholarId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);
        _clock.Advance(TimeSpan.FromMinutes(1));
        var fresh = await ArticleAsync("Намаз", revisions: 1);
        await AddRevisionAsync(edited, 2);

        var page = await Service().ListAsync(scholarId, null, false, 1, 20, default);

        page.NeedsReReviewTotal.Should().Be(1);
        page.Items.Select(item => (item.ArticleId, item.MyLatestReview?.IsCurrent))
            .Should().Equal((edited, false), (fresh, (bool?)null), (untouched, true));
        (await Service().ListNeedingReReviewAsync(scholarId, default)).Should().Equal(edited);
        (await Service().ListAsync(scholarId, "намаз", false, 1, 20, default)).NeedsReReviewTotal.Should().Be(1);
        var mark = (await Service().GetVerificationAsync(edited, default)).Marks.Single();
        (mark.IsLatestRevision, mark.IsCurrent).Should().Be((false, false));

        await Service().ReviewAsync(edited, scholarId, new ArticleReviewCreateDto(2, ArticleReviewVerdict.Confirmed, null), default);

        (await Service().ListAsync(scholarId, null, false, 1, 20, default)).NeedsReReviewTotal.Should().Be(0);
    }

    [Fact]
    public async Task GivenAMadhabScopedReview_WhenOnlyAnotherSchoolsOpinionIsEdited_ThenTheMarkStaysCurrentButTheWholeArticleReviewDoesNot()
    {
        var hanafi = await SchoolAsync("hanafi");
        var shafii = await SchoolAsync("shafii");
        var hanafiScholar = await ScholarAsync(mazhab: "hanafi");
        var wholeScholar = await ScholarAsync(mazhab: null);
        var articleId = await ArticleAsync("Вуду", revisions: 0);
        await AddRevisionAsync(articleId, 1, Opinions(hanafi, "Ханафиты: так", shafii, "Шафииты: так"));
        await Service().ReviewAsync(articleId, hanafiScholar, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);
        await Service().ReviewAsync(articleId, wholeScholar, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);

        await AddRevisionAsync(articleId, 2, Opinions(hanafi, "Ханафиты: так", shafii, "Шафииты: иначе"));
        var afterOther = (await Service().GetVerificationAsync(articleId, default)).Marks.ToDictionary(mark => mark.Mazhab ?? "", mark => mark.IsCurrent);
        await AddRevisionAsync(articleId, 3, Opinions(hanafi, "Ханафиты: иначе", shafii, "Шафииты: иначе"));
        var afterOwn = (await Service().GetVerificationAsync(articleId, default)).Marks.Single(mark => mark.Mazhab == "hanafi");

        afterOther.Should().BeEquivalentTo(new Dictionary<string, bool> { ["hanafi"] = true, [""] = false });
        afterOwn.IsCurrent.Should().BeFalse();
        (await Service().ListNeedingReReviewAsync(hanafiScholar, default)).Should().Equal(articleId);
    }

    [Fact]
    public async Task GivenRevisionsWithoutFingerprints_WhenTheMarkIsRead_ThenItCountsAsStaleUntilTheBackfillFillsThem()
    {
        var scholarId = await ScholarAsync(mazhab: null);
        var articleId = await ArticleAsync("Ифтар", revisions: 0);
        await AddRevisionAsync(articleId, 1, Snapshot("Текст"), fingerprints: false);
        await Service().ReviewAsync(articleId, scholarId, new ArticleReviewCreateDto(1, ArticleReviewVerdict.Confirmed, null), default);
        await AddRevisionAsync(articleId, 2, Snapshot("Текст  ", tags: ["пост"]), fingerprints: false);
        await SchoolAsync("maliki");

        var before = (await Service().GetVerificationAsync(articleId, default)).Marks.Single().IsCurrent;
        var filled = await ReviewFingerprintBackfill.RunAsync(_db);
        var after = (await Service().GetVerificationAsync(articleId, default)).Marks.Single().IsCurrent;

        (before, filled, after).Should().Be((false, 2, true));
        (await _db.ArticleRevisionFingerprints.CountAsync()).Should().Be(4);
        (await ReviewFingerprintBackfill.RunAsync(_db)).Should().Be(0);
    }

    private ArticleReviewService Service() => new(_db, _clock, new AuditLogRepository(_db));

    private async Task NameAsync(int userId, string displayName, string slug)
    {
        var user = await _db.Users.SingleAsync(u => u.Id == userId);
        (user.DisplayName, user.Slug) = (displayName, slug);
        await _db.SaveChangesAsync();
    }

    private async Task<int> UserAsync(UserRole role)
    {
        var user = new User { Email = $"{Guid.NewGuid():N}@mktba.test", Role = role };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user.Id;
    }

    private async Task<int> ScholarAsync(string? mazhab, string specialization = "Фикх")
    {
        var userId = await UserAsync(UserRole.Scholar);
        _db.ScholarApplications.Add(new ScholarApplication
        {
            UserId = userId,
            Degree = "Доктор наук",
            Institution = "Университет",
            Specialization = specialization,
            Mazhab = mazhab,
            Status = ScholarApplicationStatus.Approved,
            SubmittedAt = Now,
            ClosedAt = Now,
            RoleBeforeApproval = UserRole.Reader,
        });
        await _db.SaveChangesAsync();
        return userId;
    }

    private async Task<int> ArticleAsync(string title, int revisions, ArticleStatus status = ArticleStatus.Published)
    {
        var now = _clock.GetUtcNow().UtcDateTime;
        var article = new Article { Title = title, Slug = $"a-{Guid.NewGuid():N}", Status = status, CreatedAt = now, UpdatedAt = now };
        _db.Articles.Add(article);
        await _db.SaveChangesAsync();
        for (var number = 1; number <= revisions; number++)
        {
            await AddRevisionAsync(article.Id, number);
        }

        return article.Id;
    }

    private async Task<int> SchoolAsync(string slug)
    {
        var school = new School { Name = slug, ShortName = slug, Slug = slug, IsSystem = true };
        _db.Schools.Add(school);
        await _db.SaveChangesAsync();
        return school.Id;
    }

    private async Task TagAsync(int articleId, string name)
    {
        var tag = new Tag { Name = name, NormalizedName = $"{name.ToLowerInvariant()}-{Guid.NewGuid():N}", Slug = $"t-{Guid.NewGuid():N}" };
        _db.Tags.Add(tag);
        await _db.SaveChangesAsync();
        _db.Add(new ArticleTag { ArticleId = articleId, TagId = tag.Id });
        await _db.SaveChangesAsync();
    }

    /// <summary>A working-copy paragraph with one opinion linked to the school.</summary>
    private async Task OpinionAsync(int articleId, int schoolId)
    {
        var opinion = new Opinion { Content = "<p>Мнение</p>", IsDefault = true };
        _db.Paragraphs.Add(new Paragraph { ArticleId = articleId, Order = 1, Opinions = [opinion] });
        await _db.SaveChangesAsync();
        opinion.OpinionSchools.Add(new OpinionSchool { SchoolId = schoolId });
        await _db.SaveChangesAsync();
    }

    private static ArticleSnapshotDto Snapshot(string text, List<string>? tags = null, string? summary = null) => new(
        ArticleSnapshotDto.CurrentSchemaVersion, "Заголовок", "slug", summary, tags ?? [], null,
        [new ArticleSnapshotParagraphDto(1, [new ArticleSnapshotOpinionDto(text, true, [])])], []);

    private static ArticleSnapshotDto Opinions(int firstSchool, string first, int secondSchool, string second) => new(
        ArticleSnapshotDto.CurrentSchemaVersion, "Заголовок", "slug", null, [], null,
        [
            new ArticleSnapshotParagraphDto(1, [new ArticleSnapshotOpinionDto("Общее", true, [])]),
            new ArticleSnapshotParagraphDto(2,
            [
                new ArticleSnapshotOpinionDto(first, true, [firstSchool]),
                new ArticleSnapshotOpinionDto(second, false, [secondSchool]),
            ]),
        ], []);

    /// <summary>A revision as a save writes it: with its fingerprints, unless <paramref name="fingerprints"/> is false (before V-05).</summary>
    private async Task AddRevisionAsync(int articleId, int number, ArticleSnapshotDto? snapshot = null, bool fingerprints = true)
    {
        snapshot ??= Snapshot($"Текст {number}");
        var schools = await _db.Schools.Where(school => school.IsSystem)
            .Select(school => new ReviewScopeSchool(school.Slug, school.Id)).ToListAsync();
        _db.ArticleRevisions.Add(new ArticleRevision
        {
            ArticleId = articleId,
            Number = number,
            CreatedAt = _clock.GetUtcNow().UtcDateTime,
            Snapshot = ArticleSnapshots.Serialize(snapshot),
            Fingerprints = fingerprints ? ReviewFingerprints.For(snapshot, schools) : [],
        });
        await _db.SaveChangesAsync();
    }
}
