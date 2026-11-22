namespace Mktba.Domain.Entities;

/// <summary>
/// One reader event of the site's own statistics (N-02, #96; decision D7, #88: Yandex Metrika
/// counts traffic and search phrases, this table feeds the author's and the admin's dashboards).
/// An append-only log: nothing about the reader is stored — no account, address, browser or
/// cookie. <see cref="ViewId"/> is a random id of one page view, made anew on every page, so it
/// ties together the events of that view and nothing else.
/// <para>
/// The ids it carries (<see cref="ArticleId"/>, <see cref="ParagraphId"/>, <see cref="OpinionId"/>,
/// <see cref="SchoolId"/>) are plain columns, not foreign keys: the log outlives the content it
/// speaks of, and a write-heavy table checks nothing on insert. They were checked when received.
/// </para>
/// </summary>
public class AnalyticsEvent
{
    public const int QueryMaxLength = 200;
    public const int TargetPathMaxLength = 512;

    public long Id { get; set; }

    public AnalyticsEventType Type { get; set; }

    /// <summary>When the API received the event (the server's clock, never the browser's).</summary>
    public DateTime OccurredAtUtc { get; set; }

    /// <summary>The page view the event belongs to; null when the browser sent none.</summary>
    public Guid? ViewId { get; set; }

    /// <summary>The Published article read (every type but <see cref="AnalyticsEventType.Search"/>).</summary>
    public int? ArticleId { get; set; }

    /// <summary>The paragraph of the opinion (opinion events).</summary>
    public int? ParagraphId { get; set; }

    /// <summary>The opinion shown or switched to (opinion events).</summary>
    public int? OpinionId { get; set; }

    /// <summary>The mazhab the reader had chosen, if any (article events).</summary>
    public int? SchoolId { get; set; }

    /// <summary>How far through the text the reader got, in percent: 25, 50, 75 or 100 (<see cref="AnalyticsEventType.ScrollDepth"/>).</summary>
    public short? ScrollDepth { get; set; }

    /// <summary>The submitted search query, trimmed, white space collapsed (<see cref="AnalyticsEventType.Search"/>).</summary>
    public string? Query { get; set; }

    /// <summary>The site-relative path a link in the article led to, without query and fragment (<see cref="AnalyticsEventType.InternalLinkClick"/>).</summary>
    public string? TargetPath { get; set; }
}

/// <summary>What happened. Stored by name; values start at 1, so a request without a type is not read as one.</summary>
public enum AnalyticsEventType
{
    /// <summary>An article was opened.</summary>
    ArticleView = 1,

    /// <summary>A paragraph with several opinions came into view; <see cref="AnalyticsEvent.OpinionId"/> is the one on screen.</summary>
    OpinionShown = 2,

    /// <summary>The reader picked another opinion of a paragraph.</summary>
    OpinionSwitched = 3,

    /// <summary>A search was submitted.</summary>
    Search = 4,

    /// <summary>The reader passed a quarter, half, three quarters or the end of the text.</summary>
    ScrollDepth = 5,

    /// <summary>The reader followed a link in the article to another page of the site.</summary>
    InternalLinkClick = 6,
}
