using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs
{
    /// <summary>
    /// Reader events the site sends in one request (N-02, #96), at most 50. The browser sends them
    /// only with the visitor's consent to analytics; nothing in them names the reader.
    /// </summary>
    /// <param name="Events">One to 50 events (analytics_events_required, analytics_too_many_events).</param>
    public record AnalyticsEventBatchDto(IReadOnlyList<AnalyticsEventDto>? Events);

    /// <summary>
    /// One reader event. Each type reads only its own fields and ignores the rest; an event that
    /// misses one of them, names a page that is not a Published article or an opinion of another
    /// article is dropped, not an error, so one stale event does not lose the others.
    /// </summary>
    /// <param name="Type">
    /// ArticleView (<paramref name="ArticleId"/>); OpinionShown and OpinionSwitched
    /// (<paramref name="ArticleId"/>, <paramref name="ParagraphId"/>, <paramref name="OpinionId"/> of that
    /// paragraph); Search (<paramref name="Query"/>); ScrollDepth (<paramref name="ArticleId"/>,
    /// <paramref name="ScrollDepth"/>); InternalLinkClick (<paramref name="ArticleId"/> the link is in,
    /// <paramref name="TargetPath"/>).
    /// </param>
    /// <param name="ViewId">A random id the page makes anew for every page view; optional.</param>
    /// <param name="VisitorId">A random id the browser keeps for one UTC day at most, then replaces; optional. A repeated view of an article by it within 30 minutes is dropped.</param>
    /// <param name="ArticleId">The article read: a Published one.</param>
    /// <param name="ParagraphId">The paragraph of the opinion.</param>
    /// <param name="OpinionId">The opinion on screen or picked.</param>
    /// <param name="SchoolId">The mazhab the reader had chosen; an id no school has is dropped. Read by the article events.</param>
    /// <param name="ScrollDepth">25, 50, 75 or 100: the share of the text passed, in percent.</param>
    /// <param name="Query">The submitted query: 2 to 200 characters after trimming and collapsing white space.</param>
    /// <param name="TargetPath">The site-relative path the link leads to (starts with one '/'); its query and fragment are dropped; at most 512 characters.</param>
    public record AnalyticsEventDto(
        AnalyticsEventType Type,
        Guid? ViewId = null,
        int? ArticleId = null,
        int? ParagraphId = null,
        int? OpinionId = null,
        int? SchoolId = null,
        int? ScrollDepth = null,
        string? Query = null,
        string? TargetPath = null,
        Guid? VisitorId = null
    );

    /// <summary>The events are stored.</summary>
    /// <param name="Accepted">How many of the events sent were kept; the others were dropped as stale, incomplete, repeated or sent by a bot.</param>
    public record AnalyticsAcceptedDto(int Accepted);
}
