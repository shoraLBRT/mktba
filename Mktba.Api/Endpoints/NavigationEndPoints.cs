using Mktba.Application.DTOs;
using Mktba.Application.Services;

namespace Mktba.Api.Endpoints
{
    public static class NavigationEndPoints
    {
        public static IEndpointRouteBuilder MapNavigationEndpoints(this IEndpointRouteBuilder builder)
        {
            var group = builder.MapGroup("/navigationTree").WithTags("Navigation");

            group.MapGet("/tree", async (NavigationTreeService service) =>
            {
                var tree = await service.GetTreeAsync();
                return Results.Ok(tree);
            }).Produces<List<NavigationArticleDto>>();

            return builder;
        }
    }
}
