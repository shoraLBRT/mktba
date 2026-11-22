using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Analytics;

namespace Mktba.Api.Endpoints;

public static class AnalyticsEndpoints
{
    /// <summary>A batch of 50 events is a few kilobytes; anything far larger is not the site.</summary>
    private const long MaxRequestBytes = 64 * 1024;

    public static IEndpointRouteBuilder MapAnalyticsEndpoints(this IEndpointRouteBuilder builder)
    {
        builder.MapPost("/analytics/events", async (AnalyticsEventBatchDto batch, HttpRequest request, AnalyticsEventService service, CancellationToken ct) =>
            Results.Accepted(value: await service.RecordAsync(batch, request.Headers.UserAgent.ToString(), ct)))
            .WithTags("Analytics")
            .WithSummary("Stores reader events of the site's own statistics. No sign-in; sent only with the visitor's consent.")
            .WithDescription(
                "Events: ArticleView, OpinionShown, OpinionSwitched, Search, ScrollDepth, InternalLinkClick, WebVitalLcp, WebVitalInp, WebVitalCls, "
                + "1 to 50 per request (analytics_events_required, analytics_too_many_events). Nothing about "
                + "the sender is stored: no account, address or browser; the time is the server's. A request "
                + "from a bot (by its User-Agent, read but not stored) keeps none of its events; an article "
                + "view, a paragraph's opinion shown, a scroll depth or a Web Vital sent again in the same page view, and "
                + "a visitor's view of an article viewed less than 30 minutes ago, are dropped. An event "
                + "without a field its type needs, about an article that is not Published or about an opinion "
                + "of another paragraph is dropped, and the answer says how many were kept. "
                + "429 with Retry-After: too_many_requests (this client sent too many requests).")
            .Produces<AnalyticsAcceptedDto>(StatusCodes.Status202Accepted)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status429TooManyRequests)
            .WithMetadata(new RequestSizeLimitAttribute(MaxRequestBytes))
            .RequireRateLimiting(RateLimitingSetup.AnalyticsPolicy);

        builder.MapGet("/analytics/site", async (int? days, SiteAnalyticsService service, CancellationToken ct) =>
            Results.Ok(await service.GetAsync(days ?? SiteAnalyticsService.DefaultDays, ct)))
            .WithTags("Analytics")
            .WithSummary("The whole site's own statistics over the last days, for the admin dashboard.")
            .WithDescription(
                "Read from the daily summaries, rebuilt every hour: today is counted so far. days is 30 by "
                + "default, kept within 1 to 365; the period ends today (UTC). daily has every day, oldest "
                + "first, zeros when nothing happened. visitors and readers summed over several days are "
                + "visitor-days (the anonymous visitor id changes every UTC day). topArticles: the ten most "
                + "viewed articles (title and slug null when deleted); schools: article views by the mazhab "
                + "the reader had chosen, viewsWithoutSchool the rest. Traffic sources and devices are in "
                + "Yandex Metrika, not here.")
            .Produces<SiteAnalyticsDto>()
            .RequireAuthorization(Policies.CanViewSiteAnalytics);

        builder.MapGet("/analytics/search", async (int? days, SearchAnalyticsService service, CancellationToken ct) =>
            Results.Ok(await service.GetAsync(days ?? SearchAnalyticsService.DefaultDays, ct)))
            .WithTags("Analytics")
            .WithSummary("What readers searched for with the site's search over the last days, and what found nothing.")
            .WithDescription(
                "Read from the daily summaries, rebuilt every hour: today is counted so far. days is 30 by "
                + "default, kept within 1 to 365; the period ends today (UTC). Queries are in lower case and "
                + "counted for a day only when at least minSearchers distinct visitors made them that day "
                + "(a phrase one person typed is never shown, nor kept once the day is final); totals count "
                + "every search. topQueries: the twenty most searched; queriesWithoutResults: the twenty "
                + "that most often found no article. searchers summed over several days are searcher-days. "
                + "Search phrases from external search engines are in Yandex Metrika, not here.")
            .Produces<SearchAnalyticsDto>()
            .RequireAuthorization(Policies.CanViewSiteAnalytics);

        builder.MapGet("/analytics/content", async (int? days, ContentAnalyticsService service, CancellationToken ct) =>
            Results.Ok(await service.GetAsync(days ?? ContentAnalyticsService.DefaultDays, ct)))
            .WithTags("Analytics")
            .WithSummary("What to write, finish or refresh next: unread articles, stubs with readers, blocks missing a mazhab, out-of-date articles.")
            .WithDescription(
                "Views are read from the daily summaries, rebuilt every hour: today is counted so far. days "
                + "is 30 by default, kept within 1 to 365; the period ends today (UTC). The articles are "
                + "taken as they are now: Published only, every language. articlesWithoutViews: articles "
                + "with content, Published before the period began, not viewed in it, oldest publication "
                + "first. stubsWithTraffic: stubs (no text, infobox or summary) viewed in the period, most "
                + "views first. uncoveredBlocks: blocks of two or more opinions with no opinion linked to "
                + "one or more canonical mazhabs (their readers get the default opinion), most views by "
                + "those mazhabs' readers first. staleArticles: articles with content not saved for "
                + "staleAfterDays days, most views first. Each list holds at most 50 entries; total counts "
                + "them all. readers are reader-days.")
            .Produces<ContentAnalyticsDto>()
            .RequireAuthorization(Policies.CanViewSiteAnalytics);

        builder.MapGet("/analytics/me", async (int? days, ClaimsPrincipal principal, AuthorAnalyticsService service, CancellationToken ct) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.GetAsync(userId, days ?? AuthorAnalyticsService.DefaultDays, ct))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithTags("Analytics")
            .WithSummary("The signed-in author's statistics over the last days: only the articles they write or co-write.")
            .WithDescription(
                "Read from the daily summaries, rebuilt every hour: today is counted so far. days is 30 by "
                + "default, kept within 1 to 365; the period ends today (UTC). daily has every day, oldest "
                + "first: views of the user's articles and the readers who viewed any of them, as counted on "
                + "that day's authorship. readers summed over several days are reader-days (the anonymous "
                + "visitor id changes every UTC day). topArticles (at most ten), depth, schools and "
                + "viewsWithoutSchool cover only the articles the user writes or co-writes now; depth counts "
                + "the views that reached 25, 50, 75 and 100 % of the text. An admin gets their own articles "
                + "here too; the whole site is /analytics/site.")
            .Produces<AuthorAnalyticsDto>()
            .ProducesApiProblem(StatusCodes.Status401Unauthorized)
            .RequireAuthorization(Policies.CanEditArticles);

        builder.MapGet("/analytics/articles/{id:int}", async (int id, int? days, ArticleAnalyticsService service, CancellationToken ct) =>
                Results.Ok(await service.GetAsync(id, days ?? ArticleAnalyticsService.DefaultDays, ct)))
            .WithTags("Analytics")
            .WithSummary("One article's statistics over the last days: views, readers, read depth, mazhabs, opinion switches, link clicks.")
            .WithDescription(
                "For an admin, or the article's own author or co-author (as for the article's history): "
                + "another author gets 403 forbidden for a Published article and 404 article_not_found for "
                + "one they may not see, as does an article that does not exist. Read from the daily "
                + "summaries, rebuilt every hour: today is counted so far. days is 30 by default, kept "
                + "within 1 to 365; the period ends today (UTC). daily has every day, oldest first, zeros "
                + "when nothing happened. readers summed over several days are reader-days (the anonymous "
                + "visitor id changes every UTC day). depth counts the views that reached 25, 50, 75 and "
                + "100 % of the text; schools: views by the mazhab the reader had chosen, viewsWithoutSchool "
                + "the rest; internalLinkClicks: links followed from the article to another page of the site.")
            .Produces<ArticleAnalyticsDto>()
            .ProducesApiProblem(StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditArticles)
            .RequireArticleAccess(ArticleOperationRequirement.Edit);

        return builder;
    }
}
