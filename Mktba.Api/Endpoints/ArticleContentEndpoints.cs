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
                var content = await service.GetContentByArticleIdAsync(id, user.CanSeeUnpublished());
                return Results.Ok(content);
            }).Produces<ArticleContentDto>().ProducesApiProblem(StatusCodes.Status404NotFound);

            group.MapGet("/by-slug/{slug}/content", async (string slug, ClaimsPrincipal user, ArticleContentService service) =>
            {
                var lookup = await service.GetContentBySlugAsync(slug, user.CanSeeUnpublished());
                return lookup.Content is not null
                    ? Results.Ok(lookup.Content)
                    : Results.Redirect(BySlugContentPath(lookup.RedirectToSlug!), permanent: false);
            })
            .WithSummary("Article content by slug; an old slug redirects (302) to the current one.")
            .WithDescription(
                "A current slug returns the content. A slug the article used before answers 302 Found with "
                + "Location set to the current slug's URL, so clients that follow redirects get the content "
                + "and can compare its slug with the one they asked for. The redirect is temporary on purpose: "
                + "an old slug can become current again, and a cached permanent redirect would then loop. "
                + "Anonymous readers get 404 for an article that is not Published.")
            .Produces<ArticleContentDto>()
            .Produces(StatusCodes.Status302Found)
            .ProducesApiProblem(StatusCodes.Status404NotFound);

            group.MapPost("/content", async (ArticleContentCreateDto dto, ClaimsPrincipal user, ArticleContentService service) =>
            {
                var article = await service.CreateArticleWithContentAsync(dto, user.GetUserId());
                return Results.Created($"/articles/{article.Id}/content", article);
            }).Produces<ArticleContentDto>(StatusCodes.Status201Created).ProducesApiProblem(StatusCodes.Status400BadRequest).RequireAuthorization("AdminOnly");

            group.MapPut("/{id:int}/content", async (int id, ArticleContentDto dto, ArticleContentService service) =>
            {
                var (success, error) = await service.UpdateContentAsync(id, dto);
                return success ? Results.NoContent() : ApiProblemResults.Problem(StatusCodes.Status400BadRequest, error!);
            }).Produces(StatusCodes.Status204NoContent).ProducesApiProblem(StatusCodes.Status400BadRequest).RequireAuthorization("AdminOnly");

            return builder;
        }

        private static string BySlugContentPath(string slug) => $"/articles/by-slug/{Uri.EscapeDataString(slug)}/content";
    }
}
