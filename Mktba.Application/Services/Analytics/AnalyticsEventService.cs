using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services.Analytics;

/// <summary>
/// Intake of the site's own reader events (N-02, #96; decision D7, #88). Checks each event against
/// the content and stores those that hold up, stamped with the server's clock. Nothing about the
/// sender — account, address, browser — is read or stored; the limit per client is the API's rate
/// limiter (<c>RateLimiting:Analytics</c>), whose address key lives only in memory.
/// <para>
/// Telling bots apart and collapsing duplicates (N-03, #97) and the aggregates (N-04, #98) work
/// on the stored rows later; this service only refuses what cannot be true.
/// </para>
/// </summary>
public class AnalyticsEventService
{
    public const int MaxEventsPerRequest = 50;

    private static readonly HashSet<int> ScrollDepths = [25, 50, 75, 100];

    private readonly AnalyticsEventRepository _events;
    private readonly TimeProvider _timeProvider;

    public AnalyticsEventService(AnalyticsEventRepository events, TimeProvider timeProvider)
    {
        _events = events;
        _timeProvider = timeProvider;
    }

    /// <exception cref="ValidationException">analytics_events_required, analytics_too_many_events.</exception>
    public async Task<AnalyticsAcceptedDto> RecordAsync(AnalyticsEventBatchDto batch, CancellationToken cancellationToken = default)
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
        var accepted = new List<AnalyticsEvent>(events.Count);
        foreach (var dto in events)
        {
            if (ToEntity(dto, now, published, placements, schools) is { } entity)
            {
                accepted.Add(entity);
            }
        }

        if (accepted.Count > 0)
        {
            await _events.AddRangeAsync(accepted, cancellationToken);
        }

        return new AnalyticsAcceptedDto(accepted.Count);
    }

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
        var entity = new AnalyticsEvent { Type = dto.Type, OccurredAtUtc = now, ViewId = dto.ViewId };

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
