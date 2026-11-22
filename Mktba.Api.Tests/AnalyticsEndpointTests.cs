using System.Net;
using System.Net.Http.Json;
using System.Text;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>N-02 (#96): <c>POST /analytics/events</c> stores the site's own reader events, nothing about the reader.</summary>
public sealed class AnalyticsEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public AnalyticsEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenEveryEventType_WhenPosting_ThenEachIsStoredWithItsOwnFieldsAndTheServerTime()
    {
        var article = await SeedArticleAsync(ArticleStatus.Published);
        var schoolId = await GetSystemSchoolIdAsync();
        var viewId = Guid.NewGuid();
        var before = DateTime.UtcNow.AddSeconds(-5);

        var response = await PostAsync(
            new { type = "ArticleView", viewId, articleId = article.ArticleId, schoolId, query = "ignored" },
            new { type = "OpinionShown", viewId, articleId = article.ArticleId, paragraphId = article.ParagraphId, opinionId = article.SecondOpinionId, schoolId },
            new { type = "OpinionSwitched", viewId, articleId = article.ArticleId, paragraphId = article.ParagraphId, opinionId = article.FirstOpinionId },
            new { type = "Search", viewId, query = "  намаз   в пути ", articleId = article.ArticleId },
            new { type = "ScrollDepth", viewId, articleId = article.ArticleId, scrollDepth = 75 },
            new { type = "InternalLinkClick", viewId, articleId = article.ArticleId, targetPath = "/zakyat?mazhab=hanafi#nisab" });

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);
        (await response.Content.ReadFromJsonAsync<AnalyticsAcceptedDto>(ApiJson.Options))!.Accepted.Should().Be(6);

        var stored = await LoadAsync(viewId);
        stored.Should().HaveCount(6);
        stored.Should().OnlyContain(e => e.OccurredAtUtc >= before && e.OccurredAtUtc <= DateTime.UtcNow.AddSeconds(5));

        var view = stored.Single(e => e.Type == AnalyticsEventType.ArticleView);
        view.ArticleId.Should().Be(article.ArticleId);
        view.SchoolId.Should().Be(schoolId);
        view.Query.Should().BeNull();

        var shown = stored.Single(e => e.Type == AnalyticsEventType.OpinionShown);
        shown.ParagraphId.Should().Be(article.ParagraphId);
        shown.OpinionId.Should().Be(article.SecondOpinionId);

        stored.Single(e => e.Type == AnalyticsEventType.OpinionSwitched).OpinionId.Should().Be(article.FirstOpinionId);

        var search = stored.Single(e => e.Type == AnalyticsEventType.Search);
        search.Query.Should().Be("намаз в пути");
        search.ArticleId.Should().BeNull();
        search.ResultCount.Should().Be(1, "the factory's search finds one article for a query it was not told about");

        stored.Single(e => e.Type == AnalyticsEventType.ScrollDepth).ScrollDepth.Should().Be(75);
        stored.Single(e => e.Type == AnalyticsEventType.InternalLinkClick).TargetPath.Should().Be("/zakyat");
    }

    [Fact]
    public async Task GivenSearches_WhenPosting_ThenEachIsStoredWithWhatTheSiteSearchFindsForIt()
    {
        _factory.SearchResults["пятничная молитва"] = 7;
        _factory.SearchResults["несуществующая тема"] = 0;
        var viewId = Guid.NewGuid();

        var response = await PostAsync(
            new { type = "Search", viewId, query = "пятничная   молитва" },
            new { type = "Search", viewId, query = "несуществующая тема" },
            new { type = "Search", viewId, query = "несуществующая тема" });

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);
        var stored = await LoadAsync(viewId);
        stored.Should().HaveCount(3);
        stored.Single(e => e.Query == "пятничная молитва").ResultCount.Should().Be(7);
        stored.Where(e => e.Query == "несуществующая тема").Should().HaveCount(2).And.OnlyContain(e => e.ResultCount == 0);
    }

    [Fact]
    public async Task GivenMoreDistinctSearchesThanTheCap_WhenPosting_ThenOnlyTheFirstQueriesAreCountedAndTheRestKeptWithoutACount()
    {
        var viewId = Guid.NewGuid();
        var queries = Enumerable.Range(1, 5).Select(i => $"вопрос номер {i} {viewId:N}").ToArray();
        foreach (var query in queries)
        {
            _factory.SearchResults[query] = 4;
        }

        var response = await PostAsync(
            new { type = "Search", viewId, query = queries[0] },
            new { type = "Search", viewId, query = queries[1] },
            new { type = "Search", viewId, query = queries[0] },
            new { type = "Search", viewId, query = queries[2] },
            new { type = "Search", viewId, query = queries[3] },
            new { type = "Search", viewId, query = queries[4] });

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);
        (await response.Content.ReadFromJsonAsync<AnalyticsAcceptedDto>(ApiJson.Options))!.Accepted.Should().Be(6);
        var stored = await LoadAsync(viewId);
        stored.Where(e => e.Query == queries[0] || e.Query == queries[1] || e.Query == queries[2])
            .Should().HaveCount(4).And.OnlyContain(e => e.ResultCount == 4);
        stored.Where(e => e.Query == queries[3] || e.Query == queries[4])
            .Should().HaveCount(2).And.OnlyContain(e => e.ResultCount == null);
        _factory.SearchCounts.Should().Be(3, "the site's search runs once per counted query");
    }

    [Fact]
    public async Task GivenABotsSearches_WhenPosting_ThenTheSearchIsNeverRun()
    {
        var viewId = Guid.NewGuid();
        var before = _factory.SearchCounts;
        var response = await PostAsAsync("curl/8.4.0", new { type = "Search", viewId, query = $"бот ищет {viewId:N}" });

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);
        (await LoadAsync(viewId)).Should().BeEmpty();
        _factory.SearchCounts.Should().Be(before);
    }

    [Fact]
    public async Task GivenStaleOrIncompleteEvents_WhenPosting_ThenOnlyTheValidOnesAreKept()
    {
        var published = await SeedArticleAsync(ArticleStatus.Published);
        var other = await SeedArticleAsync(ArticleStatus.Published);
        var draft = await SeedArticleAsync(ArticleStatus.Draft);
        var viewId = Guid.NewGuid();

        var response = await PostAsync(
            new { type = "ArticleView", viewId, articleId = published.ArticleId, schoolId = int.MaxValue },
            new { type = "ArticleView", viewId, articleId = draft.ArticleId, schoolId = 0 },
            new { type = "ArticleView", viewId, articleId = int.MaxValue, schoolId = 0 },
            new { type = "ArticleView", viewId, articleId = (int?)null, schoolId = 0 },
            new { type = "OpinionShown", viewId, articleId = published.ArticleId, paragraphId = other.ParagraphId, opinionId = other.FirstOpinionId },
            new { type = "OpinionSwitched", viewId, articleId = published.ArticleId, paragraphId = published.ParagraphId, opinionId = other.FirstOpinionId },
            new { type = "Search", viewId, query = "а" },
            new { type = "Search", viewId, query = new string('а', 201) },
            new { type = "ScrollDepth", viewId, articleId = published.ArticleId, scrollDepth = 60 },
            new { type = "InternalLinkClick", viewId, articleId = published.ArticleId, targetPath = "https://example.com/" },
            new { type = "InternalLinkClick", viewId, articleId = published.ArticleId, targetPath = "//example.com/x" },
            new { type = "InternalLinkClick", viewId, articleId = published.ArticleId, targetPath = "/a b" });

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);
        (await response.Content.ReadFromJsonAsync<AnalyticsAcceptedDto>(ApiJson.Options))!.Accepted.Should().Be(1);
        var stored = (await LoadAsync(viewId)).Should().ContainSingle().Subject;
        stored.ArticleId.Should().Be(published.ArticleId);
        stored.SchoolId.Should().BeNull("an id no school has is dropped, the event kept");
    }

    [Theory]
    [InlineData("""{"events":[]}""", "analytics_events_required")]
    [InlineData("""{}""", "analytics_events_required")]
    [InlineData("""{"events":[{"type":"Unknown"}]}""", "bad_request")]
    [InlineData("not json", "bad_request")]
    public async Task GivenInvalidBody_WhenPosting_ThenReturns400WithCode(string json, string code)
    {
        var response = await _factory.CreateClient().PostAsync("/analytics/events", new StringContent(json, Encoding.UTF8, "application/json"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(response)).Should().Be(code);
    }

    [Fact]
    public async Task GivenMoreThan50Events_WhenPosting_ThenReturns400AndStoresNothing()
    {
        var viewId = Guid.NewGuid();
        var events = Enumerable.Range(0, 51).Select(_ => new { type = "Search", viewId, query = "пост" }).ToArray();

        var response = await _factory.CreateClient().PostAsJsonAsync("/analytics/events", new { events });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("analytics_too_many_events");
        (await LoadAsync(viewId)).Should().BeEmpty();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("curl/8.4.0")]
    [InlineData("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")]
    [InlineData("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36")]
    public async Task GivenABotUserAgent_WhenPosting_ThenNothingIsStored(string? userAgent)
    {
        var article = await SeedArticleAsync(ArticleStatus.Published);
        var viewId = Guid.NewGuid();

        var response = await PostAsAsync(
            userAgent,
            new { type = "ArticleView", viewId, articleId = article.ArticleId },
            new { type = "Search", viewId, query = "намаз" });

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);
        (await response.Content.ReadFromJsonAsync<AnalyticsAcceptedDto>(ApiJson.Options))!.Accepted.Should().Be(0);
        (await LoadAsync(viewId)).Should().BeEmpty();
    }

    [Fact]
    public async Task GivenRepeatsWithinOnePageView_WhenPosting_ThenOncePerViewEventsCountOnceAndActionsEveryTime()
    {
        var article = await SeedArticleAsync(ArticleStatus.Published);
        var viewId = Guid.NewGuid();
        var view = new { type = "ArticleView", viewId, articleId = article.ArticleId };
        var shown = new { type = "OpinionShown", viewId, articleId = article.ArticleId, paragraphId = article.ParagraphId, opinionId = article.FirstOpinionId };
        var shownOther = new { type = "OpinionShown", viewId, articleId = article.ArticleId, paragraphId = article.ParagraphId, opinionId = article.SecondOpinionId };
        var switched = new { type = "OpinionSwitched", viewId, articleId = article.ArticleId, paragraphId = article.ParagraphId, opinionId = article.SecondOpinionId };
        var half = new { type = "ScrollDepth", viewId, articleId = article.ArticleId, scrollDepth = 50 };
        var end = new { type = "ScrollDepth", viewId, articleId = article.ArticleId, scrollDepth = 100 };

        var first = await PostAsync(view, view, shown, shownOther, switched, switched, half, half, end);
        var second = await PostAsync(view, shown, half, switched);

        (await first.Content.ReadFromJsonAsync<AnalyticsAcceptedDto>(ApiJson.Options))!.Accepted.Should().Be(6);
        (await second.Content.ReadFromJsonAsync<AnalyticsAcceptedDto>(ApiJson.Options))!.Accepted.Should().Be(1, "only the switch is new");

        var stored = await LoadAsync(viewId);
        stored.Count(e => e.Type == AnalyticsEventType.ArticleView).Should().Be(1);
        stored.Should().ContainSingle(e => e.Type == AnalyticsEventType.OpinionShown).Which.OpinionId.Should().Be(article.FirstOpinionId);
        stored.Count(e => e.Type == AnalyticsEventType.OpinionSwitched).Should().Be(3);
        stored.Where(e => e.Type == AnalyticsEventType.ScrollDepth).Select(e => e.ScrollDepth).Should().BeEquivalentTo(new short?[] { 50, 100 });
    }

    [Fact]
    public async Task GivenAVisitorViewedTheArticleLessThan30MinutesAgo_WhenViewingAgain_ThenTheViewIsDroppedAndTheRestKept()
    {
        var article = await SeedArticleAsync(ArticleStatus.Published);
        var other = await SeedArticleAsync(ArticleStatus.Published);
        var visitorId = Guid.NewGuid();
        var longAgo = Guid.NewGuid();
        await StoreViewAsync(longAgo, article.ArticleId, DateTime.UtcNow.AddMinutes(-31));

        var firstView = Guid.NewGuid();
        var reload = Guid.NewGuid();
        var otherVisitorView = Guid.NewGuid();
        var longAgoView = Guid.NewGuid();
        await PostAsync(new { type = "ArticleView", viewId = firstView, visitorId, articleId = article.ArticleId });
        var response = await PostAsync(
            new { type = "ArticleView", viewId = reload, visitorId, articleId = article.ArticleId },
            new { type = "ScrollDepth", viewId = reload, visitorId, articleId = article.ArticleId, scrollDepth = 25 },
            new { type = "ArticleView", viewId = reload, visitorId, articleId = other.ArticleId },
            new { type = "ArticleView", viewId = otherVisitorView, visitorId = Guid.NewGuid(), articleId = article.ArticleId },
            new { type = "ArticleView", viewId = longAgoView, visitorId = longAgo, articleId = article.ArticleId });

        (await response.Content.ReadFromJsonAsync<AnalyticsAcceptedDto>(ApiJson.Options))!.Accepted.Should().Be(4);
        var stored = await LoadAsync(reload);
        stored.Should().NotContain(e => e.Type == AnalyticsEventType.ArticleView && e.VisitorId == visitorId && e.ArticleId == article.ArticleId);
        stored.Should().Contain(e => e.Type == AnalyticsEventType.ScrollDepth && e.VisitorId == visitorId);
        stored.Should().Contain(e => e.Type == AnalyticsEventType.ArticleView && e.ArticleId == other.ArticleId);
        (await LoadAsync(otherVisitorView)).Should().ContainSingle();
        (await LoadAsync(longAgoView)).Should().ContainSingle("the earlier view is older than the window");
        (await LoadAsync(firstView)).Should().ContainSingle().Which.VisitorId.Should().Be(visitorId);
    }

    /// <summary>What a reader's browser sends; a request without a User-Agent is a bot's.</summary>
    private const string BrowserUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

    private Task<HttpResponseMessage> PostAsync(params object[] events)
        => PostAsAsync(BrowserUserAgent, events);

    private Task<HttpResponseMessage> PostAsAsync(string? userAgent, params object[] events)
    {
        var client = _factory.CreateClient();
        if (userAgent is not null)
        {
            client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", userAgent);
        }

        return client.PostAsJsonAsync("/analytics/events", new { events });
    }

    private async Task StoreViewAsync(Guid visitorId, int articleId, DateTime occurredAtUtc)
    {
        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
        dbContext.AnalyticsEvents.Add(new AnalyticsEvent
        {
            Type = AnalyticsEventType.ArticleView,
            OccurredAtUtc = occurredAtUtc,
            ViewId = Guid.NewGuid(),
            VisitorId = visitorId,
            ArticleId = articleId,
        });
        await dbContext.SaveChangesAsync();
    }

    private async Task<List<AnalyticsEvent>> LoadAsync(Guid viewId)
    {
        using var scope = _factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<MktbaDbContext>().AnalyticsEvents.AsNoTracking()
            .Where(e => e.ViewId == viewId)
            .ToListAsync();
    }

    private async Task<int> GetSystemSchoolIdAsync()
    {
        using var scope = _factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<MktbaDbContext>().Schools.Where(s => s.IsSystem).Select(s => s.Id).FirstAsync();
    }

    private async Task<(int ArticleId, int ParagraphId, int FirstOpinionId, int SecondOpinionId)> SeedArticleAsync(ArticleStatus status)
    {
        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
        var first = new Opinion { Content = "Первое мнение", IsDefault = true };
        var second = new Opinion { Content = "Второе мнение" };
        var paragraph = new Paragraph
        {
            Order = 1,
            Article = new Article { Title = "N-02 test article", Slug = "n02-" + Guid.NewGuid().ToString("N"), Status = status },
            Opinions = { first, second },
        };
        dbContext.Paragraphs.Add(paragraph);
        await dbContext.SaveChangesAsync();
        return (paragraph.ArticleId, paragraph.Id, first.Id, second.Id);
    }
}
