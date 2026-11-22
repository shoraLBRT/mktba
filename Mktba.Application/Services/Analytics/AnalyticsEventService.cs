using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services.Analytics;

/// <summary>
/// Intake of the site's own reader events (N-02, #96; decision D7, #88). Checks each event against
/// the content and stores those that hold up, stamped with the server's clock. Nothing about the
/// sender — account, address, browser — is stored (the User-Agent is only read, to tell bots); the
/// limit per client is the API's rate limiter (<c>RateLimiting:Analytics</c>), whose address key
/// lives only in memory.
/// <para>
/// Bots and repeats (N-03, #97) are dropped here, before anything is stored, so the aggregates
/// (N-04, #98) count the rows as they are:
/// <list type="bullet">
/// <item>a request whose User-Agent is a bot's (<see cref="BotUserAgent"/>) keeps none of its
/// events; the header is read, never stored;</item>
/// <item>within one page view (<see cref="AnalyticsEvent.ViewId"/>) an article view, a paragraph's
/// first opinion shown and each scroll depth count once — the same event sent again, in this batch
/// or an earlier one, is dropped; a switch, a search or a link click is an action and counts every
/// time;</item>
/// <item>an article view by a visitor (<see cref="AnalyticsEvent.VisitorId"/>) who viewed that article
/// less than <see cref="RepeatViewWindow"/> ago — a reload, a way back — is dropped; the other events
/// of that page view are kept.</item>
/// </list>
/// Two requests of one page view racing each other can still both land; the client sends one
/// request at a time, so this is left to the aggregates.
/// </para>
/// <para>
/// A search is stored with the number of articles the site's search finds for it at that moment
/// (<see cref="ISearchResultCounter"/>, N-06, #100), so the search analytics can list the queries
/// that found nothing. The browser is not asked. The endpoint is public, so the count must not
/// turn it into a cheaper way to run the search: only events that passed the bot filter and the
/// repeat checks are counted, once per distinct query, and only the first
/// <see cref="AnalyticsOptions.MaxSearchCountsPerRequest"/> distinct queries of a request (the site
/// sends one search per batch); the others are stored with no count (unknown).
/// </para>
/// </summary>
public class AnalyticsEventService
{
    public const int MaxEventsPerRequest = 50;

    /// <summary>A visitor's views of one article this close together count as one.</summary>
    public static readonly TimeSpan RepeatViewWindow = TimeSpan.FromMinutes(30);

    private static readonly HashSet<int> ScrollDepths = [25, 50, 75, 100];

    private static readonly AnalyticsEventType[] OncePerViewTypes =
        [AnalyticsEventType.ArticleView, AnalyticsEventType.OpinionShown, AnalyticsEventType.ScrollDepth, .. WebVitals.Metrics];

    /// <summary>What makes an event of <see cref="OncePerViewTypes"/> the same as another in its page view.</summary>
    private readonly record struct OncePerViewKey(Guid ViewId, AnalyticsEventType Type, int? ArticleId, int? ParagraphId, short? ScrollDepth);

    private readonly AnalyticsEventRepository _events;
    private readonly ISearchResultCounter _searchResults;
    private readonly TimeProvider _timeProvider;
    private readonly int _maxSearchCounts;

    public AnalyticsEventService(
        AnalyticsEventRepository events, ISearchResultCounter searchResults, TimeProvider timeProvider, IOptions<AnalyticsOptions> options)
    {
        _events = events;
        _searchResults = searchResults;
        _timeProvider = timeProvider;
        _maxSearchCounts = Math.Max(0, options.Value.MaxSearchCountsPerRequest);
    }

    /// <param name="batch">The events sent.</param>
    /// <param name="userAgent">The request's User-Agent: read to tell bots, never stored.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <exception cref="ValidationException">analytics_events_required, analytics_too_many_events.</exception>
    public async Task<AnalyticsAcceptedDto> RecordAsync(AnalyticsEventBatchDto batch, string? userAgent, CancellationToken cancellationToken = default)
    {
        var events = batch.Events?.Where(e => e is not null).ToList() ?? [];
        if (events.Count == 0)
        {
            throw new ValidationException(AppErrors.AnalyticsEventsRequired);
        }

        if (events.Count > MaxEventsPerRequest)
        {
            throw new ValidationException(AppErrors.AnalyticsTooManyEvents(MaxEventsPerRequest));
        }

        if (BotUserAgent.IsBot(userAgent))
        {
            return new AnalyticsAcceptedDto(0);
        }

        var articleIds = events.Select(e => e.ArticleId).OfType<int>().Distinct().ToList();
        var published = articleIds.Count == 0
            ? []
            : (await _events.GetPublishedArticleIdsAsync(articleIds, cancellationToken)).ToHashSet();

        var opinionIds = events.Where(e => IsOpinionEvent(e.Type)).Select(e => e.OpinionId).OfType<int>().Distinct().ToList();
        var placements = opinionIds.Count == 0
            ? []
            : (await _events.GetOpinionPlacementsAsync(opinionIds, cancellationToken)).ToDictionary(p => p.OpinionId);

        var schoolIds = events.Select(e => e.SchoolId).OfType<int>().Distinct().ToList();
        var schools = schoolIds.Count == 0
            ? []
            : (await _events.GetExistingSchoolIdsAsync(schoolIds, cancellationToken)).ToHashSet();

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var valid = new List<AnalyticsEvent>(events.Count);
        foreach (var dto in events)
        {
            if (ToEntity(dto, now, published, placements, schools) is { } entity)
            {
                valid.Add(entity);
            }
        }

        var accepted = await DropRepeatsAsync(valid, now, cancellationToken);
        if (accepted.Count > 0)
        {
            await CountSearchResultsAsync(accepted, cancellationToken);
            await _events.AddRangeAsync(accepted, cancellationToken);
        }

        return new AnalyticsAcceptedDto(accepted.Count);
    }

    /// <summary>
    /// Sets <see cref="AnalyticsEvent.ResultCount"/> of the searches of the first
    /// <see cref="_maxSearchCounts"/> distinct queries, in the order sent, asking the search once per
    /// query; later queries stay without a count.
    /// </summary>
    private async Task CountSearchResultsAsync(List<AnalyticsEvent> events, CancellationToken cancellationToken)
    {
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var search in events.Where(e => e.Type == AnalyticsEventType.Search))
        {
            var query = search.Query!;
            if (!counts.TryGetValue(query, out var count))
            {
                if (counts.Count >= _maxSearchCounts)
                {
                    continue;
                }

                count = counts[query] = await _searchResults.CountAsync(query, cancellationToken);
            }

            search.ResultCount = count;
        }
    }

    /// <summary>
    /// <paramref name="events"/> without the ones already counted: a once-per-view event its page
    /// view already has, an article view its visitor made within <see cref="RepeatViewWindow"/>.
    /// Reads the stored events of the batch's page views and visitors once.
    /// </summary>
    private async Task<List<AnalyticsEvent>> DropRepeatsAsync(List<AnalyticsEvent> events, DateTime now, CancellationToken cancellationToken)
    {
        var viewIds = events.Where(e => OncePerViewKeyOf(e) is not null).Select(e => e.ViewId!.Value).Distinct().ToList();
        var seenInView = viewIds.Count == 0
            ? []
            : (await _events.GetViewEventsAsync(viewIds, OncePerViewTypes, cancellationToken))
                .Select(OncePerViewKeyOf).OfType<OncePerViewKey>().ToHashSet();

        var visitorIds = events
            .Where(e => e.Type == AnalyticsEventType.ArticleView && e.VisitorId is not null)
            .Select(e => e.VisitorId!.Value).Distinct().ToList();
        var recentlyViewed = visitorIds.Count == 0
            ? []
            : (await _events.GetArticleViewsSinceAsync(visitorIds, now - RepeatViewWindow, cancellationToken))
                .Select(e => (e.VisitorId!.Value, e.ArticleId)).ToHashSet();

        var kept = new List<AnalyticsEvent>(events.Count);
        foreach (var entity in events)
        {
            if (OncePerViewKeyOf(entity) is { } key && !seenInView.Add(key))
            {
                continue;
            }

            if (entity.Type == AnalyticsEventType.ArticleView
                && entity.VisitorId is Guid visitorId
                && !recentlyViewed.Add((visitorId, entity.ArticleId)))
            {
                continue;
            }

            kept.Add(entity);
        }

        return kept;
    }

    private static OncePerViewKey? OncePerViewKeyOf(AnalyticsEvent entity)
        => entity.ViewId is Guid viewId && OncePerViewTypes.Contains(entity.Type)
            ? new OncePerViewKey(
                viewId,
                entity.Type,
                entity.ArticleId,
                entity.Type == AnalyticsEventType.OpinionShown ? entity.ParagraphId : null,
                entity.ScrollDepth)
            : null;

    private static bool IsOpinionEvent(AnalyticsEventType type)
        => type is AnalyticsEventType.OpinionShown or AnalyticsEventType.OpinionSwitched;

    /// <summary>The row to store, or null when the event lacks a field its type needs or names what is not there.</summary>
    private static AnalyticsEvent? ToEntity(
        AnalyticsEventDto dto,
        DateTime now,
        HashSet<int> published,
        Dictionary<int, OpinionPlacementRow> placements,
        HashSet<int> schools)
    {
        var entity = new AnalyticsEvent { Type = dto.Type, OccurredAtUtc = now, ViewId = dto.ViewId, VisitorId = dto.VisitorId };

        if (dto.Type == AnalyticsEventType.Search)
        {
            var query = ArticleSearchService.NormalizeQuery(dto.Query);
            if (query.Length < ArticleSearchService.MinQueryLength
                || query.Length > AnalyticsEvent.QueryMaxLength
                || query.Any(char.IsControl)
                || HasUnpairedSurrogate(query))
            {
                return null;
            }

            entity.Query = query;
            return entity;
        }

        // Web Vitals (N-11, #153) are measured on any page: no article, no mazhab.
        if (WebVitals.IsWebVital(dto.Type))
        {
            if (dto.Value is not double value || !double.IsFinite(value) || value < 0 || value > WebVitals.MaxValue(dto.Type))
            {
                return null;
            }

            entity.MetricValue = value;
            return entity;
        }

        // Every other type is read on an article page.
        if (!Enum.IsDefined(dto.Type) || dto.ArticleId is not int articleId || !published.Contains(articleId))
        {
            return null;
        }

        entity.ArticleId = articleId;
        entity.SchoolId = dto.SchoolId is int schoolId && schools.Contains(schoolId) ? schoolId : null;

        switch (dto.Type)
        {
            case AnalyticsEventType.ArticleView:
                return entity;

            case AnalyticsEventType.OpinionShown or AnalyticsEventType.OpinionSwitched:
                if (dto.OpinionId is not int opinionId
                    || !placements.TryGetValue(opinionId, out var placement)
                    || placement.ArticleId != articleId
                    || placement.ParagraphId != dto.ParagraphId)
                {
                    return null;
                }

                entity.ParagraphId = placement.ParagraphId;
                entity.OpinionId = opinionId;
                return entity;

            case AnalyticsEventType.ScrollDepth:
                if (dto.ScrollDepth is not int depth || !ScrollDepths.Contains(depth))
                {
                    return null;
                }

                entity.ScrollDepth = (short)depth;
                return entity;

            case AnalyticsEventType.InternalLinkClick:
                if (NormalizeTargetPath(dto.TargetPath) is not { } path)
                {
                    return null;
                }

                entity.TargetPath = path;
                return entity;

            default:
                return null;
        }
    }

    /// <summary>
    /// The path part of a site-relative link: one leading '/', no query or fragment, no white space
    /// or control characters, at most <see cref="AnalyticsEvent.TargetPathMaxLength"/> characters;
    /// null for anything else (an absolute or protocol-relative URL included).
    /// </summary>
    private static string? NormalizeTargetPath(string? value)
    {
        if (string.IsNullOrEmpty(value) || value[0] != '/' || value.StartsWith("//", StringComparison.Ordinal) || value.StartsWith("/\\", StringComparison.Ordinal))
        {
            return null;
        }

        var end = value.IndexOfAny(['?', '#']);
        var path = end < 0 ? value : value[..end];
        if (path.Length > AnalyticsEvent.TargetPathMaxLength
            || path.Any(c => char.IsControl(c) || char.IsWhiteSpace(c))
            || HasUnpairedSurrogate(path))
        {
            return null;
        }

        return path;
    }

    private static bool HasUnpairedSurrogate(string value)
    {
        for (var i = 0; i < value.Length; i++)
        {
            if (char.IsHighSurrogate(value[i]) && i + 1 < value.Length && char.IsLowSurrogate(value[i + 1]))
            {
                i++;
            }
            else if (char.IsSurrogate(value[i]))
            {
                return true;
            }
        }

        return false;
    }
}
