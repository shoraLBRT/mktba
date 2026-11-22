namespace Mktba.Application.Services.Analytics;

/// <summary>
/// How many articles the site's search finds for a query (N-06, #100): read when a search event
/// arrives, so the search analytics can tell the queries that found nothing. Implemented by
/// <see cref="ArticleSearchService"/>, which needs PostgreSQL; the API tests put a stand-in here.
/// </summary>
public interface ISearchResultCounter
{
    /// <param name="query">A normalized query of <see cref="ArticleSearchService.MinQueryLength"/> to <see cref="ArticleSearchService.MaxQueryLength"/> characters.</param>
    /// <param name="cancellationToken">Cancels the count.</param>
    Task<int> CountAsync(string query, CancellationToken cancellationToken = default);
}
