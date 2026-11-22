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

        stored.Single(e => e.Type == AnalyticsEventType.ScrollDepth).ScrollDepth.Should().Be(75);
        stored.Single(e => e.Type == AnalyticsEventType.InternalLinkClick).TargetPath.Should().Be("/zakyat");
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

    private Task<HttpResponseMessage> PostAsync(params object[] events)
        => _factory.CreateClient().PostAsJsonAsync("/analytics/events", new { events });

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
