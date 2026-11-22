namespace Mktba.Domain.Entities;

// Daily summaries of the own analytics events (N-04, #98). One UTC day each, rebuilt from the raw
// rows of that day as a whole (re-running a day replaces its rows), so the dashboards (N-05…N-09,
// P-03) read small tables and the raw log can be cut back after a while. Like the log, nothing here
// names a reader: "readers" is the number of distinct daily visitor ids (N-03, #97), which change
// every UTC day — so readers of several days add up to visits by day, not to people, and readers
// of one scope (an author, a tag) are counted over that scope, not summed from its articles.
// Ids are plain columns, not foreign keys: a summary outlives the content it speaks of.

/// <summary>The site as a whole on one UTC day; its row also records that the day was aggregated.</summary>
public class AnalyticsDay
{
    public DateOnly Day { get; set; }

    /// <summary>Article views (<see cref="AnalyticsEventType.ArticleView"/>) on the day.</summary>
    public int ArticleViews { get; set; }

    /// <summary>Distinct visitor ids behind any event of the day.</summary>
    public int Visitors { get; set; }

    /// <summary>Searches submitted on the day.</summary>
    public int Searches { get; set; }

    /// <summary>Searches of the day that found no article (N-06, #100); a search stored before results were counted is not one.</summary>
    public int SearchesWithoutResults { get; set; }

    /// <summary>
    /// The day was aggregated after it had closed and settled, so it is never aggregated again and
    /// its raw events may be removed once they are old enough. A day not final yet (today, or one
    /// that ended moments ago) is rebuilt on every run.
    /// </summary>
    public bool IsFinal { get; set; }

    /// <summary>When the day's rows were last built (the server's clock).</summary>
    public DateTime AggregatedAtUtc { get; set; }
}

/// <summary>One article on one UTC day; a row exists for every article with any event that day.</summary>
public class AnalyticsArticleDay
{
    public DateOnly Day { get; set; }

    public int ArticleId { get; set; }

    public int Views { get; set; }

    /// <summary>Distinct visitor ids that viewed the article.</summary>
    public int Readers { get; set; }

    /// <summary>Paragraphs with several opinions that came into view (once per paragraph per page view).</summary>
    public int OpinionsShown { get; set; }

    public int OpinionSwitches { get; set; }

    /// <summary>Page views that got at least a quarter through the text (scroll depths count once per page view).</summary>
    public int ReachedDepth25 { get; set; }

    public int ReachedDepth50 { get; set; }

    public int ReachedDepth75 { get; set; }

    /// <summary>Page views that got to the end of the text.</summary>
    public int ReachedDepth100 { get; set; }

    /// <summary>Links followed from the article to another page of the site.</summary>
    public int InternalLinkClicks { get; set; }
}

/// <summary>
/// Views of one article with one mazhab chosen, on one UTC day. Views without a chosen mazhab are the
/// article's <see cref="AnalyticsArticleDay.Views"/> less the sum of these rows.
/// </summary>
public class AnalyticsArticleSchoolDay
{
    public DateOnly Day { get; set; }

    public int ArticleId { get; set; }

    public int SchoolId { get; set; }

    public int Views { get; set; }

    public int Readers { get; set; }
}

/// <summary>
/// Views of one author's articles on one UTC day: the articles they wrote or co-author at the time the
/// day was aggregated.
/// </summary>
public class AnalyticsAuthorDay
{
    public DateOnly Day { get; set; }

    public int UserId { get; set; }

    public int Views { get; set; }

    /// <summary>Distinct visitor ids that viewed any of the author's articles.</summary>
    public int Readers { get; set; }

    /// <summary>How many of the author's articles were viewed.</summary>
    public int Articles { get; set; }
}

/// <summary>Views of the articles with one tag on one UTC day (the tags at the time the day was aggregated).</summary>
public class AnalyticsTagDay
{
    public DateOnly Day { get; set; }

    public int TagId { get; set; }

    public int Views { get; set; }

    public int Readers { get; set; }

    public int Articles { get; set; }
}

/// <summary>
/// One search query on one UTC day, compared without regard to case (stored in lower case). Once the
/// day is final only queries made by at least <c>Analytics:SearchQueryMinSearchers</c> distinct
/// visitors keep a row (N-06, #100): a phrase only one person typed is not kept as text.
/// </summary>
public class AnalyticsSearchDay
{
    public DateOnly Day { get; set; }

    public string Query { get; set; } = string.Empty;

    public int Searches { get; set; }

    /// <summary>Distinct visitor ids that searched for it.</summary>
    public int Searchers { get; set; }

    /// <summary>Of <see cref="Searches"/>, those that found no article (N-06, #100).</summary>
    public int SearchesWithoutResults { get; set; }
}
