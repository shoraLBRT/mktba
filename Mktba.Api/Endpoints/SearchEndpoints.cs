using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Services;

namespace Mktba.Api.Endpoints
{
    public static class SearchEndpoints
    {
        public static IEndpointRouteBuilder MapSearchEndpoints(this IEndpointRouteBuilder builder)
        {
            var group = builder.MapGroup("/search").WithTags("Search");

            group.MapGet("/", async (
                string? q, string? locale, int? page, int? pageSize, bool? verified, ArticleSearchService service,
                CancellationToken cancellationToken) =>
                Results.Ok(await service.SearchAsync(
                    q, locale, page ?? 1, pageSize ?? ArticleSearchService.DefaultPageSize, verified ?? false, cancellationToken)))
            .WithSummary("Full-text search over articles.")
            .WithDescription(
                "Searches the title, summary, tags and opinion texts with Russian morphology; an article "
                + "matches when it holds every word of q. Only articles a reader can open are searched: "
                + "Published and not under a non-Published parent. The same results for every caller, best "
                + "match first. Matched words come as separate text runs (match: true), never as markup. "
                + "q is trimmed and must be 2 to 200 characters (400 search_query_too_short / "
                + "search_query_too_long); locale defaults to ru (an unsupported one answers 400 "
                + "locale_unsupported); page starts at 1 and is kept within 1 to 100; pageSize is 10 by "
                + "default, kept within 1 to 50. verified=true keeps only the articles verified by scholars (V-08); "
                + "each result says whether it is (isVerified).")
            .Produces<SearchResultsDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest);

            return builder;
        }
    }
}
