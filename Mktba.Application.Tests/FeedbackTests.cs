using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Feedback;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>
/// F-02 (#67): intake of anonymous feedback and its delivery to the issue tracker, with the tracker
/// replaced by a fake. The GitHub client itself is covered by <see cref="GitHubIssueClientTests"/>.
/// </summary>
public class FeedbackTests
{
    private static readonly DateTime Start = new(2026, 11, 19, 10, 0, 0, DateTimeKind.Utc);

    private readonly MktbaDbContext _context = TestDbHelper.CreateInMemoryContext();
    private readonly FakeClock _clock = new(Start);
    private readonly FakeTracker _tracker = new();

    [Fact]
    public async Task GivenValidMessage_WhenSubmitted_ThenItIsStoredPendingWithTrimmedFields()
    {
        var article = await AddArticleAsync("Омовение", ArticleStatus.Published);
        await AddHanafiAsync();

        var accepted = await Intake().SubmitAsync(new FeedbackCreateDto(
            FeedbackType.ArticleError, "  Опечатка во втором абзаце.\r\nВторая строка\0  ", "  reader@example.com ", "https://mktba.ru/article/omovenie?mazhab=hanafi", article.Id, " Hanafi "));

        var stored = await _context.FeedbackMessages.SingleAsync();
        accepted.Id.Should().Be(stored.Id);
        stored.Type.Should().Be(FeedbackType.ArticleError);
        stored.Text.Should().Be("Опечатка во втором абзаце.\nВторая строка");
        stored.Contact.Should().Be("reader@example.com");
        stored.PageUrl.Should().Be("https://mktba.ru/article/omovenie?mazhab=hanafi");
        stored.ArticleId.Should().Be(article.Id);
        stored.Mazhab.Should().Be("hanafi");
        stored.CreatedAtUtc.Should().Be(Start);
        stored.DeliveryState.Should().Be(FeedbackDeliveryState.Pending);
        stored.Attempts.Should().Be(0);
        stored.NextAttemptAtUtc.Should().Be(Start);
        stored.DeliveryKey.Should().NotBeEmpty();
    }

    [Fact]
    public async Task GivenOnlyTypeAndText_WhenSubmitted_ThenOptionalFieldsAreNull()
    {
        await Intake().SubmitAsync(new FeedbackCreateDto(FeedbackType.Idea, "Добавьте тёмную тему", " ", null, null, ""));

        var stored = await _context.FeedbackMessages.SingleAsync();
        stored.Contact.Should().BeNull();
        stored.PageUrl.Should().BeNull();
        stored.ArticleId.Should().BeNull();
        stored.Mazhab.Should().BeNull();
    }

    [Fact]
    public async Task GivenUnknownArticleAndMazhab_WhenSubmitted_ThenMessageIsStoredWithoutThem()
    {
        await Intake().SubmitAsync(new FeedbackCreateDto(FeedbackType.SiteProblem, "Не открывается поиск", null, "/search?q=x", 999_999, "zahiri"));

        var stored = await _context.FeedbackMessages.SingleAsync();
        stored.ArticleId.Should().BeNull();
        stored.Mazhab.Should().BeNull();
        stored.PageUrl.Should().Be("/search?q=x");
    }

    [Theory]
    [MemberData(nameof(InvalidMessages))]
    public async Task GivenInvalidMessage_WhenSubmitted_ThenValidationFailsAndNothingIsStored(FeedbackCreateDto dto, string code)
    {
        var act = () => Intake().SubmitAsync(dto);

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be(code);
        (await _context.FeedbackMessages.CountAsync()).Should().Be(0);
    }

    public static TheoryData<FeedbackCreateDto, string> InvalidMessages => new()
    {
        { new FeedbackCreateDto(default, "Текст", null, null, null, null), "feedback_type_invalid" },
        { new FeedbackCreateDto((FeedbackType)42, "Текст", null, null, null, null), "feedback_type_invalid" },
        { new FeedbackCreateDto(FeedbackType.Idea, null!, null, null, null, null), "feedback_text_required" },
        { new FeedbackCreateDto(FeedbackType.Idea, " \n\t ", null, null, null, null), "feedback_text_required" },
        { new FeedbackCreateDto(FeedbackType.Idea, new string('я', FeedbackMessage.TextMaxLength + 1), null, null, null, null), "feedback_text_too_long" },
        { new FeedbackCreateDto(FeedbackType.Idea, "Текст", new string('k', FeedbackMessage.ContactMaxLength + 1), null, null, null), "feedback_contact_too_long" },
        { new FeedbackCreateDto(FeedbackType.Idea, "Текст", null, "javascript:alert(1)", null, null), "feedback_page_url_invalid" },
        { new FeedbackCreateDto(FeedbackType.Idea, "Текст", null, "https://mktba.ru/" + new string('a', FeedbackMessage.PageUrlMaxLength), null, null), "feedback_page_url_invalid" },
    };

    [Fact]
    public async Task GivenTextOfExactlyMaxLength_WhenSubmitted_ThenItIsStored()
    {
        await Intake().SubmitAsync(new FeedbackCreateDto(FeedbackType.Idea, new string('я', FeedbackMessage.TextMaxLength), null, null, null, null));

        (await _context.FeedbackMessages.SingleAsync()).Text.Should().HaveLength(FeedbackMessage.TextMaxLength);
    }

    [Fact]
    public async Task GivenTrackerNotConfigured_WhenDeliveryRuns_ThenMessageStaysPendingUntouched()
    {
        _tracker.IsConfigured = false;
        await Intake().SubmitAsync(new FeedbackCreateDto(FeedbackType.Idea, "Идея", null, null, null, null));

        var run = await Delivery().DeliverDueAsync();

        run.Should().Be(new FeedbackDeliveryRun(0, false));
        var stored = await ReloadSingleAsync();
        stored.DeliveryState.Should().Be(FeedbackDeliveryState.Pending);
        stored.Attempts.Should().Be(0);
        stored.LastError.Should().BeNull();
        _tracker.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task GivenPendingMessage_WhenDelivered_ThenIssueHasLabelsAndContextButNeverTheContact()
    {
        var article = await AddArticleAsync("Условия омовения", ArticleStatus.Published);
        await AddHanafiAsync();
        var accepted = await Intake().SubmitAsync(new FeedbackCreateDto(
            FeedbackType.ArticleError, "Во втором абзаце ошибка.", "secret-contact@example.com", "https://mktba.ru/article/usloviya", article.Id, "hanafi"));
        _clock.Advance(TimeSpan.FromSeconds(30));

        var run = await Delivery().DeliverDueAsync();

        run.Should().Be(new FeedbackDeliveryRun(1, false));
        var created = _tracker.Created.Should().ContainSingle().Subject;
        created.Labels.Should().Equal("feedback", "needs-triage");
        created.Title.Should().Be($"Обратная связь №{accepted.Id}: ошибка в статье «Условия омовения»");
        created.Body.Should().Contain("Во втором абзаце ошибка.")
            .And.Contain("https://mktba.ru/article/usloviya")
            .And.Contain("- **Статья:** ` Условия омовения `")
            .And.Contain("Ханафитский мазхаб")
            .And.Contain($"оставлен; хранится только в базе сайта, обращение №{accepted.Id}")
            .And.NotContain("secret-contact");
        created.Title.Should().NotContain("secret-contact");

        var stored = await ReloadSingleAsync();
        created.Body.Should().Contain(FeedbackIssueFormatter.Marker(stored.DeliveryKey));
        stored.DeliveryState.Should().Be(FeedbackDeliveryState.Delivered);
        stored.GitHubIssueNumber.Should().Be(101);
        stored.GitHubIssueUrl.Should().Be("https://github.test/issues/101");
        stored.DeliveredAtUtc.Should().Be(Start.AddSeconds(30));
        stored.Attempts.Should().Be(1);
        stored.LastError.Should().BeNull();
        stored.Contact.Should().Be("secret-contact@example.com");
    }

    [Fact]
    public async Task GivenDraftArticleAndNoContact_WhenDelivered_ThenArticleTitleIsNotPublished()
    {
        var article = await AddArticleAsync("Тайный черновик", ArticleStatus.Draft);
        await Intake().SubmitAsync(new FeedbackCreateDto(FeedbackType.ArticleError, "Ошибка", null, null, article.Id, null));

        await Delivery().DeliverDueAsync();

        var created = _tracker.Created.Should().ContainSingle().Subject;
        created.Title.Should().NotContain("Тайный черновик");
        created.Body.Should().NotContain("Тайный черновик").And.Contain("не опубликована").And.Contain("**Контакт:** не оставлен");
    }

    [Fact]
    public async Task GivenTrackerUnavailable_WhenDeliveryRuns_ThenMessageWaitsWithGrowingDelayAndRunStopsEarly()
    {
        await Intake().SubmitAsync(new FeedbackCreateDto(FeedbackType.Idea, "Первое", null, null, null, null));
        await Intake().SubmitAsync(new FeedbackCreateDto(FeedbackType.Idea, "Второе", null, null, null, null));
        _tracker.FailCreateWith = new FeedbackTrackerException(FeedbackTrackerFailure.Unavailable, "GitHub create issue: HTTP 503");

        var first = await Delivery().DeliverDueAsync();

        first.Should().Be(new FeedbackDeliveryRun(0, true));
        var rows = await ReloadAllAsync();
        rows[0].DeliveryState.Should().Be(FeedbackDeliveryState.Pending);
        rows[0].Attempts.Should().Be(1);
        rows[0].LastError.Should().Be("GitHub create issue: HTTP 503");
        rows[0].NextAttemptAtUtc.Should().Be(Start.AddSeconds(60));
        rows[1].Attempts.Should().Be(0, "the run stops at the first failure that is not about the message");

        // The second message is due at once; the first one only after its delay, which then doubles.
        await Delivery().DeliverDueAsync();
        _clock.Advance(TimeSpan.FromSeconds(59));
        await Delivery().DeliverDueAsync();
        (await ReloadAllAsync())[0].Attempts.Should().Be(1);

        _clock.Advance(TimeSpan.FromSeconds(1));
        await Delivery().DeliverDueAsync();
        var retried = (await ReloadAllAsync())[0];
        retried.Attempts.Should().Be(2);
        retried.NextAttemptAtUtc.Should().Be(Start.AddSeconds(60 + 120));
        retried.DeliveryState.Should().Be(FeedbackDeliveryState.Pending);
    }

    [Fact]
    public async Task GivenTrackerBackAfterOutage_WhenRetried_ThenMessageIsDeliveredOnce()
    {
        await Intake().SubmitAsync(new FeedbackCreateDto(FeedbackType.Idea, "Идея", null, null, null, null));
        _tracker.FailCreateWith = new FeedbackTrackerException(FeedbackTrackerFailure.Unavailable, "GitHub create issue: no connection");
        await Delivery().DeliverDueAsync();
        _tracker.FailCreateWith = null;
        _clock.Advance(TimeSpan.FromMinutes(1));

        var run = await Delivery().DeliverDueAsync();
        await Delivery().DeliverDueAsync();

        run.Should().Be(new FeedbackDeliveryRun(1, false));
        _tracker.Created.Should().ContainSingle();
        var stored = await ReloadSingleAsync();
        stored.DeliveryState.Should().Be(FeedbackDeliveryState.Delivered);
        stored.LastError.Should().BeNull();
        stored.Attempts.Should().Be(2);
    }

    [Fact]
    public async Task GivenAttemptCutOffAfterIssueWasCreated_WhenRetried_ThenExistingIssueIsTakenAndNoSecondOneIsCreated()
    {
        await Intake().SubmitAsync(new FeedbackCreateDto(FeedbackType.Idea, "Идея", null, null, null, null));
        // The state a crash leaves behind: the attempt was counted, the issue exists, the row never learned of it.
        var row = await _context.FeedbackMessages.SingleAsync();
        row.Attempts = 1;
        await _context.SaveChangesAsync();
        _tracker.Existing[FeedbackIssueFormatter.Marker(row.DeliveryKey)] = new FeedbackIssueRef(77, "https://github.test/issues/77");

        var run = await Delivery().DeliverDueAsync();

        run.Delivered.Should().Be(1);
        _tracker.Created.Should().BeEmpty();
        _tracker.Searches.Should().ContainSingle().Which.Should().Be(Start.AddMinutes(-5));
        var stored = await ReloadSingleAsync();
        stored.DeliveryState.Should().Be(FeedbackDeliveryState.Delivered);
        stored.GitHubIssueNumber.Should().Be(77);
    }

    [Fact]
    public async Task GivenTrackerRejectsMessage_WhenDeliveryRuns_ThenItFailsForGoodAndTheNextMessageIsStillTried()
    {
        await Intake().SubmitAsync(new FeedbackCreateDto(FeedbackType.Idea, "Отклоняемое", null, null, null, null));
        await Intake().SubmitAsync(new FeedbackCreateDto(FeedbackType.Idea, "Обычное", null, null, null, null));
        _tracker.RejectBodiesContaining = "Отклоняемое";

        var run = await Delivery().DeliverDueAsync();
        _clock.Advance(TimeSpan.FromDays(1));
        await Delivery().DeliverDueAsync();

        run.Should().Be(new FeedbackDeliveryRun(1, false));
        var rows = await ReloadAllAsync();
        rows[0].DeliveryState.Should().Be(FeedbackDeliveryState.Failed);
        rows[0].Attempts.Should().Be(1);
        rows[0].LastError.Should().Be("GitHub create issue: HTTP 422");
        rows[1].DeliveryState.Should().Be(FeedbackDeliveryState.Delivered);
    }

    [Fact]
    public void GivenRetryDelay_WhenFailuresGrow_ThenItDoublesUpToTheMaximum()
    {
        var options = new FeedbackDeliveryOptions { RetryBaseSeconds = 60, RetryMaxSeconds = 3600 };

        options.RetryDelay(1).Should().Be(TimeSpan.FromMinutes(1));
        options.RetryDelay(3).Should().Be(TimeSpan.FromMinutes(4));
        options.RetryDelay(7).Should().Be(TimeSpan.FromHours(1));
        options.RetryDelay(500).Should().Be(TimeSpan.FromHours(1));
    }

    [Theory]
    [InlineData(true, "5514770", "o", "r", "key", null, true)]
    [InlineData(true, "5514770", "o", "r", null, "C:/keys/app.pem", true)]
    [InlineData(true, "5514770", "o", "r", null, null, false)]
    [InlineData(true, null, "o", "r", "key", null, false)]
    [InlineData(true, "5514770", null, "r", "key", null, false)]
    [InlineData(true, "5514770", "o", " ", "key", null, false)]
    [InlineData(false, "5514770", "o", "r", "key", null, false)]
    public void GivenGitHubOptions_WhenAnyRequiredPartIsMissingOrDisabled_ThenTheAppIsNotConfigured(
        bool enabled, string? appId, string? owner, string? repository, string? key, string? keyPath, bool expected)
    {
        var options = new FeedbackGitHubOptions
        {
            Enabled = enabled, AppId = appId, Owner = owner, Repository = repository, PrivateKey = key, PrivateKeyPath = keyPath,
        };

        options.IsConfigured.Should().Be(expected);
    }

    private FeedbackService Intake(FeedbackOptions? options = null) => new(
        new FeedbackRepository(_context),
        Options.Create(options ?? new FeedbackOptions()),
        _clock,
        NullLogger<FeedbackService>.Instance);

    private FeedbackDeliveryService Delivery() => new(
        new FeedbackRepository(_context),
        _tracker,
        Options.Create(new FeedbackOptions()),
        _clock,
        NullLogger<FeedbackDeliveryService>.Instance);

    private async Task<Article> AddArticleAsync(string title, ArticleStatus status)
    {
        var article = new Article { Title = title, Slug = $"a-{Guid.NewGuid():N}", Locale = "ru", Status = status };
        _context.Articles.Add(article);
        await _context.SaveChangesAsync();
        return article;
    }

    private async Task AddHanafiAsync()
    {
        _context.Schools.Add(new School { Slug = "hanafi", Name = "Ханафитский мазхаб", ShortName = "Хан", IsSystem = true });
        await _context.SaveChangesAsync();
    }

    private async Task<FeedbackMessage> ReloadSingleAsync() => (await ReloadAllAsync()).Single();

    private Task<List<FeedbackMessage>> ReloadAllAsync()
        => _context.FeedbackMessages.AsNoTracking().OrderBy(f => f.Id).ToListAsync();

    internal sealed class FakeClock(DateTime start) : TimeProvider
    {
        private DateTimeOffset _now = new(start);

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan by) => _now = _now.Add(by);
    }

    private sealed record CreatedIssue(string Title, string Body, IReadOnlyList<string> Labels);

    private sealed class FakeTracker : IFeedbackIssueTracker
    {
        public bool IsConfigured { get; set; } = true;

        public FeedbackTrackerException? FailCreateWith { get; set; }

        public string? RejectBodiesContaining { get; set; }

        public Dictionary<string, FeedbackIssueRef> Existing { get; } = [];

        public List<CreatedIssue> Created { get; } = [];

        public List<DateTime> Searches { get; } = [];

        public List<string> Calls { get; } = [];

        public Task<FeedbackIssueRef?> FindByMarkerAsync(string marker, DateTime sinceUtc, CancellationToken cancellationToken)
        {
            Calls.Add("find");
            Searches.Add(sinceUtc);
            return Task.FromResult(Existing.GetValueOrDefault(marker));
        }

        public Task<FeedbackIssueRef> CreateAsync(string title, string body, IReadOnlyList<string> labels, CancellationToken cancellationToken)
        {
            Calls.Add("create");
            if (FailCreateWith is not null)
            {
                throw FailCreateWith;
            }

            if (RejectBodiesContaining is not null && body.Contains(RejectBodiesContaining, StringComparison.Ordinal))
            {
                throw new FeedbackTrackerException(FeedbackTrackerFailure.Rejected, "GitHub create issue: HTTP 422");
            }

            Created.Add(new CreatedIssue(title, body, labels));
            var number = 100 + Created.Count;
            return Task.FromResult(new FeedbackIssueRef(number, $"https://github.test/issues/{number}"));
        }
    }
}

/// <summary>F-02 (#67) on a real PostgreSQL: the migration's table, its foreign key and the row guard.</summary>
public class FeedbackPostgresTests : IClassFixture<PostgresDatabaseFixture>
{
    private readonly PostgresDatabaseFixture _database;

    public FeedbackPostgresTests(PostgresDatabaseFixture database)
    {
        _database = database;
    }

    [Fact]
    public async Task GivenStoredMessageAboutArticle_WhenArticleIsDeleted_ThenMessageStaysWithoutIt()
    {
        int articleId;
        await using (var context = _database.CreateContext())
        {
            var article = new Article { Title = "Удаляемая", Slug = $"feedback-{Guid.NewGuid():N}", Locale = "ru", Status = ArticleStatus.Published };
            context.Articles.Add(article);
            await context.SaveChangesAsync();
            articleId = article.Id;
            await Intake(context).SubmitAsync(
                new FeedbackCreateDto(FeedbackType.ArticleError, "Ошибка \0 с эмодзи 🕌 и одиночным суррогатом \ud83d.", "\0contact", "/article/x", articleId, null));
        }

        await using (var context = _database.CreateContext())
        {
            await context.Articles.Where(a => a.Id == articleId).ExecuteDeleteAsync();
        }

        await using (var context = _database.CreateContext())
        {
            var stored = await context.FeedbackMessages.SingleAsync(f => f.Contact == "contact");
            stored.ArticleId.Should().BeNull();
            stored.Text.Should().Be("Ошибка  с эмодзи 🕌 и одиночным суррогатом .");
            stored.DeliveryState.Should().Be(FeedbackDeliveryState.Pending);
        }
    }

    [Fact]
    public async Task GivenHourlyCapReached_WhenSubmittedOnPostgres_ThenRefusedUntilTheOldestMessageLeavesTheWindow()
    {
        // The other tests of this class share the table: the cap counts the newest rows whoever stored them.
        await using var context = _database.CreateContext();
        var clock = new FeedbackTests.FakeClock(DateTime.UtcNow.AddDays(1));
        var intake = new FeedbackService(
            new FeedbackRepository(context),
            Options.Create(new FeedbackOptions { Intake = { MaxPerHour = 2 } }),
            clock,
            NullLogger<FeedbackService>.Instance);
        var message = new FeedbackCreateDto(FeedbackType.Idea, "Поток", null, null, null, null);
        await intake.SubmitAsync(message);
        clock.Advance(TimeSpan.FromMinutes(10));
        await intake.SubmitAsync(message);

        var refused = await FluentActions.Awaiting(() => intake.SubmitAsync(message)).Should().ThrowAsync<TooManyRequestsException>();
        clock.Advance(TimeSpan.FromMinutes(50));
        var accepted = await intake.SubmitAsync(message);

        refused.Which.RetryAfter.Should().BeCloseTo(TimeSpan.FromMinutes(50), TimeSpan.FromSeconds(1));
        accepted.Id.Should().BePositive();
    }

    private static FeedbackService Intake(MktbaDbContext context) => new(
        new FeedbackRepository(context),
        Options.Create(new FeedbackOptions { Intake = { MaxPerHour = 0 } }),
        TimeProvider.System,
        NullLogger<FeedbackService>.Instance);

    [Fact]
    public async Task GivenTwoWorkersHoldingTheSameMessage_WhenBothStartAnAttempt_ThenTheSecondLosesIt()
    {
        int id;
        await using (var context = _database.CreateContext())
        {
            id = (await Intake(context).SubmitAsync(
                new FeedbackCreateDto(FeedbackType.Idea, "Гонка", null, null, null, null))).Id;
        }

        await using var first = _database.CreateContext();
        await using var second = _database.CreateContext();
        var firstRow = await first.FeedbackMessages.SingleAsync(f => f.Id == id);
        var secondRow = await second.FeedbackMessages.SingleAsync(f => f.Id == id);
        firstRow.Attempts++;
        secondRow.Attempts++;
        await first.SaveChangesAsync();

        var act = () => second.SaveChangesAsync();

        await act.Should().ThrowAsync<DbUpdateConcurrencyException>();
    }
}
