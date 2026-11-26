using System.Security.Claims;
using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Services;

namespace Mktba.Api.Endpoints
{
    public static class NavigationEndPoints
    {
        public static IEndpointRouteBuilder MapNavigationEndpoints(this IEndpointRouteBuilder builder)
        {
            var group = builder.MapGroup("/navigationTree").WithTags("Navigation");

            group.MapGet("/tree", async (string? locale, ClaimsPrincipal user, NavigationTreeService service) =>
            {
                var tree = await service.GetTreeAsync(user.ToArticleViewer(), locale);
                return Results.Ok(tree);
            })
            .WithDescription(
                "Anonymous readers get only Published articles; a Published article under a non-Published "
                + "parent is hidden with its subtree. Admins get every article with its status. "
                + "locale, when given, keeps one language: an article hangs under its nearest ancestor of that "
                + "language, or becomes a root when it has none (an unsupported one answers 400 locale_unsupported); "
                + "without it every language is in one tree.")
            .Produces<List<NavigationArticleDto>>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest);

            return builder;
        }
    }
}
