using Microsoft.AspNetCore.Mvc;
using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
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
                "Events: ArticleView, OpinionShown, OpinionSwitched, Search, ScrollDepth, InternalLinkClick, "
                + "1 to 50 per request (analytics_events_required, analytics_too_many_events). Nothing about "
                + "the sender is stored: no account, address or browser; the time is the server's. A request "
                + "from a bot (by its User-Agent, read but not stored) keeps none of its events; an article "
                + "view, a paragraph's opinion shown or a scroll depth sent again in the same page view, and "
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

        return builder;
    }
}
