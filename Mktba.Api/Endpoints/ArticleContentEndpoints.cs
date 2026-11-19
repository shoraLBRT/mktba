using System.Security.Claims;
using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Services;

namespace Mktba.Api.Endpoints
{
    public static class ArticleContentEndpoints
    {
        public static IEndpointRouteBuilder MapArticleContentEndpoints(this IEndpointRouteBuilder builder)
        {
            var group = builder.MapGroup("/articles").WithTags("ArticleContent");

            group.MapGet("/{id:int}/content", async (int id, ClaimsPrincipal user, ArticleContentService service) =>
            {
                var content = await service.GetContentByArticleIdAsync(id, user.ToArticleViewer());
                return Results.Ok(content);
            }).Produces<ArticleContentDto>().ProducesApiProblem(StatusCodes.Status404NotFound);

            group.MapGet("/by-slug/{slug}/content", async (string slug, string? locale, ClaimsPrincipal user, ArticleContentService service) =>
            {
                var lookup = await service.GetContentBySlugAsync(slug, user.ToArticleViewer(), locale);
                return lookup.Content is not null
                    ? Results.Ok(lookup.Content)
                    : Results.Redirect(BySlugContentPath(lookup.RedirectToSlug!, locale), permanent: false);
            })
            .WithSummary("Article content by slug; an old slug redirects (302) to the current one.")
            .WithDescription(
                "A current slug returns the content. A slug the article used before answers 302 Found with "
                + "Location set to the current slug's URL, so clients that follow redirects get the content "
                + "and can compare its slug with the one they asked for. The redirect is temporary on purpose: "
                + "an old slug can become current again, and a cached permanent redirect would then loop. "
                + "An article that is not Published answers 404 except to an admin or its own author or "
                + "co-author. Slugs are unique per "
                + "language: the optional locale query parameter (default ru) picks the language, and an "
                + "unsupported one answers 400 locale_unsupported.")
            .Produces<ArticleContentDto>()
            .Produces(StatusCodes.Status302Found)
            .ProducesApiProblem(StatusCodes.Status400BadRequest)
            .ProducesApiProblem(StatusCodes.Status404NotFound);

            group.MapPost("/content", async (ArticleContentCreateDto dto, ClaimsPrincipal user, ArticleContentService service) =>
            {
                var article = await service.CreateArticleWithContentAsync(dto, user.GetUserId());
                return Results.Created($"/articles/{article.Id}/content", article);
            }).Produces<ArticleContentDto>(StatusCodes.Status201Created).ProducesApiProblem(StatusCodes.Status400BadRequest).RequireAuthorization(Policies.CanEditArticles);

            group.MapPut("/{id:int}/content", async (int id, ArticleContentDto dto, ClaimsPrincipal user, ArticleContentService service) =>
            {
                var (success, error) = await service.UpdateContentAsync(id, dto, user.GetUserId());
                return success ? Results.NoContent() : ApiProblemResults.Problem(StatusCodes.Status400BadRequest, error!);
            })
            .WithSummary("Saves the article's content as a new revision.")
            .WithDescription(
                "Admins may save any article, authors only those they wrote or co-author (403 forbidden "
                + "for a Published article of someone else, 404 article_not_found for their other drafts). "
                + "A save of a Published article is live at once; review of such edits is D4 (#20).")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditArticles)
            .RequireArticleAccess(ArticleOperationRequirement.Edit);

            MapRevisionEndpoints(group);

            return builder;
        }

        private static void MapRevisionEndpoints(RouteGroupBuilder group)
        {
            group.MapGet("/{id:int}/revisions", async (int id, ArticleRevisionService service) =>
                Results.Ok(await service.ListAsync(id)))
            .WithSummary("The article's revisions, newest first.")
            .Produces<List<ArticleRevisionSummaryDto>>()
            .ProducesApiProblem(StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditArticles)
            .RequireArticleAccess(ArticleOperationRequirement.Edit);

            group.MapGet("/{id:int}/revisions/{number:int}", async (int id, int number, ArticleRevisionService service) =>
                Results.Ok(await service.GetAsync(id, number)))
            .WithSummary("One revision with its snapshot.")
            .Produces<ArticleRevisionDto>()
            .ProducesApiProblem(StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditArticles)
            .RequireArticleAccess(ArticleOperationRequirement.Edit);

            group.MapGet("/{id:int}/revisions/compare", async (int id, int from, int to, ArticleRevisionService service) =>
                Results.Ok(await service.CompareAsync(id, from, to)))
            .WithSummary("Two revisions with their snapshots; the client renders the difference.")
            .Produces<ArticleRevisionComparisonDto>()
            .ProducesApiProblem(StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditArticles)
            .RequireArticleAccess(ArticleOperationRequirement.Edit);

            group.MapPost("/{id:int}/revisions/{number:int}/restore", async (int id, int number, ArticleRevisionRestoreDto dto, ClaimsPrincipal user, ArticleRevisionService service) =>
                Results.Ok(await service.RestoreAsync(id, number, dto.Comment, user.GetUserId())))
            .WithSummary("Rolls the article back to a revision by saving it as a new revision.")
            .WithDescription(
                "The working copy is replaced with the revision's snapshot and a new revision is written; "
                + "no revision is changed or deleted. Answers 400 when the snapshot no longer fits, e.g. "
                + "its slug now belongs to another article or a related article was deleted.")
            .Produces<ArticleRevisionSummaryDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest)
            .ProducesApiProblem(StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditArticles)
            .RequireArticleAccess(ArticleOperationRequirement.Edit);
        }

        private static string BySlugContentPath(string slug, string? locale) =>
            $"/articles/by-slug/{Uri.EscapeDataString(slug)}/content"
            + (string.IsNullOrWhiteSpace(locale) ? "" : $"?locale={Uri.EscapeDataString(locale.Trim().ToLowerInvariant())}");
    }
}
