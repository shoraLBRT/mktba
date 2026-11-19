using Mktba.Application.DTOs;
using Mktba.Application.Services;

namespace Mktba.Api.Endpoints;

public static class UserEndpoints
{
    public static IEndpointRouteBuilder MapUserEndpoints(this IEndpointRouteBuilder builder)
    {
        var group = builder.MapGroup("/users").WithTags("Users").RequireAuthorization("AdminOnly");

        group.MapGet("/", async (ArticleAuthorshipService service) => Results.Ok(await service.ListUsersAsync()))
            .WithSummary("Every user, for choosing article authors. Admin only: it lists emails.")
            .Produces<List<UserSummaryDto>>();

        return builder;
    }
}
