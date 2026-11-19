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

            group.MapGet("/tree", async (ClaimsPrincipal user, NavigationTreeService service) =>
            {
                var tree = await service.GetTreeAsync(user.ToArticleViewer());
                return Results.Ok(tree);
            })
            .WithDescription(
                "Anonymous readers get only Published articles; a Published article under a non-Published "
                + "parent is hidden with its subtree. Admins get every article with its status.")
            .Produces<List<NavigationArticleDto>>();

            return builder;
        }
    }
}
