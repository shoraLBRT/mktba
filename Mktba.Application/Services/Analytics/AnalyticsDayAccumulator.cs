using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services.Analytics;

/// <summary>
/// Counts the raw events of one UTC day into its summaries (N-04, #98). Events are added one by one
/// as they are read, so a day is never held in memory as rows; only the distinct visitor ids of each
/// scope are. An event without a visitor id counts as a view but adds no reader.
/// </summary>
public sealed class AnalyticsDayAccumulator
{
    private sealed class ArticleCounts
    {
        public int Views;
        public readonly HashSet<Guid> Readers = [];
        public int OpinionsShown;
        public int OpinionSwitches;
        public int Depth25;
        public int Depth50;
        public int Depth75;
        public int Depth100;
        public int InternalLinkClicks;
    }

    private sealed class ViewCounts
    {
        public int Views;
        public readonly HashSet<Guid> Readers = [];
    }

    private readonly DateOnly _day;
    private readonly Dictionary<int, ArticleCounts> _articles = [];
    private readonly Dictionary<(int ArticleId, int SchoolId), ViewCounts> _articleSchools = [];
    private readonly Dictionary<string, ViewCounts> _searches = new(StringComparer.Ordinal);
    private readonly HashSet<Guid> _visitors = [];
    private int _articleViews;
    private int _searchCount;

    public AnalyticsDayAccumulator(DateOnly day)
    {
        _day = day;
    }

    /// <summary>The articles any event of the day was about.</summary>
    public IReadOnlyCollection<int> ArticleIds => _articles.Keys;

    public void Add(AnalyticsEventFacts e)
    {
        if (e.VisitorId is { } visitor)
        {
            _visitors.Add(visitor);
        }

        if (e.Type == AnalyticsEventType.Search)
        {
            AddSearch(e);
            return;
        }

        if (e.ArticleId is not { } articleId)
        {
            return;
        }

        var article = Article(articleId);
        switch (e.Type)
        {
            case AnalyticsEventType.ArticleView:
                _articleViews++;
                article.Views++;
                AddReader(article.Readers, e.VisitorId);
                if (e.SchoolId is { } schoolId)
                {
                    var school = _articleSchools.TryGetValue((articleId, schoolId), out var found)
                        ? found
                        : _articleSchools[(articleId, schoolId)] = new ViewCounts();
                    school.Views++;
                    AddReader(school.Readers, e.VisitorId);
                }

                break;
            case AnalyticsEventType.OpinionShown:
                article.OpinionsShown++;
                break;
            case AnalyticsEventType.OpinionSwitched:
                article.OpinionSwitches++;
                break;
            case AnalyticsEventType.ScrollDepth:
                switch (e.ScrollDepth)
                {
                    case 25: article.Depth25++; break;
                    case 50: article.Depth50++; break;
                    case 75: article.Depth75++; break;
                    case 100: article.Depth100++; break;
                }

                break;
            case AnalyticsEventType.InternalLinkClick:
                article.InternalLinkClicks++;
                break;
        }
    }

    /// <summary>
    /// The day's summaries. Authors and tags come from <paramref name="attributions"/> — the articles
    /// as they are now; an article missing from it (deleted since) is counted for itself only.
    /// </summary>
    public AnalyticsDaySummaries Build(IEnumerable<ArticleAttribution> attributions, bool isFinal, DateTime aggregatedAtUtc)
    {
        var authors = new Dictionary<int, (ViewCounts Counts, int Articles)>();
        var tags = new Dictionary<int, (ViewCounts Counts, int Articles)>();
        foreach (var attribution in attributions)
        {
            if (!_articles.TryGetValue(attribution.ArticleId, out var article) || article.Views == 0)
            {
                continue;
            }

            foreach (var userId in attribution.AuthorIds)
            {
                AddViewed(authors, userId, article);
            }

            foreach (var tagId in attribution.TagIds)
            {
                AddViewed(tags, tagId, article);
            }
        }

        return new AnalyticsDaySummaries(
            new AnalyticsDay
            {
                Day = _day,
                ArticleViews = _articleViews,
                Visitors = _visitors.Count,
                Searches = _searchCount,
                IsFinal = isFinal,
                AggregatedAtUtc = aggregatedAtUtc,
            },
            _articles.Select(pair => new AnalyticsArticleDay
            {
                Day = _day,
                ArticleId = pair.Key,
                Views = pair.Value.Views,
                Readers = pair.Value.Readers.Count,
                OpinionsShown = pair.Value.OpinionsShown,
                OpinionSwitches = pair.Value.OpinionSwitches,
                ReachedDepth25 = pair.Value.Depth25,
                ReachedDepth50 = pair.Value.Depth50,
                ReachedDepth75 = pair.Value.Depth75,
                ReachedDepth100 = pair.Value.Depth100,
                InternalLinkClicks = pair.Value.InternalLinkClicks,
            }).ToList(),
            _articleSchools.Select(pair => new AnalyticsArticleSchoolDay
            {
                Day = _day,
                ArticleId = pair.Key.ArticleId,
                SchoolId = pair.Key.SchoolId,
                Views = pair.Value.Views,
                Readers = pair.Value.Readers.Count,
            }).ToList(),
            authors.Select(pair => new AnalyticsAuthorDay
            {
                Day = _day,
                UserId = pair.Key,
                Views = pair.Value.Counts.Views,
                Readers = pair.Value.Counts.Readers.Count,
                Articles = pair.Value.Articles,
            }).ToList(),
            tags.Select(pair => new AnalyticsTagDay
            {
                Day = _day,
                TagId = pair.Key,
                Views = pair.Value.Counts.Views,
                Readers = pair.Value.Counts.Readers.Count,
                Articles = pair.Value.Articles,
            }).ToList(),
            _searches.Select(pair => new AnalyticsSearchDay
            {
                Day = _day,
                Query = pair.Key,
                Searches = pair.Value.Views,
                Searchers = pair.Value.Readers.Count,
            }).ToList());
    }

    private void AddSearch(AnalyticsEventFacts e)
    {
        if (string.IsNullOrWhiteSpace(e.Query))
        {
            return;
        }

        _searchCount++;
        var query = e.Query.ToLowerInvariant();
        var counts = _searches.TryGetValue(query, out var found) ? found : _searches[query] = new ViewCounts();
        counts.Views++;
        AddReader(counts.Readers, e.VisitorId);
    }

    private ArticleCounts Article(int articleId)
        => _articles.TryGetValue(articleId, out var found) ? found : _articles[articleId] = new ArticleCounts();

    private static void AddReader(HashSet<Guid> readers, Guid? visitorId)
    {
        if (visitorId is { } id)
        {
            readers.Add(id);
        }
    }

    private static void AddViewed(Dictionary<int, (ViewCounts Counts, int Articles)> scopes, int key, ArticleCounts article)
    {
        var (counts, articles) = scopes.TryGetValue(key, out var found) ? found : (new ViewCounts(), 0);
        counts.Views += article.Views;
        counts.Readers.UnionWith(article.Readers);
        scopes[key] = (counts, articles + 1);
    }
}
