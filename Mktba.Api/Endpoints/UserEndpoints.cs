using System.Security.Claims;
using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Services;

namespace Mktba.Api.Endpoints;

public static class UserEndpoints
{
    public static IEndpointRouteBuilder MapUserEndpoints(this IEndpointRouteBuilder builder)
    {
        var group = builder.MapGroup("/users").WithTags("Users").RequireAuthorization(Policies.CanManageUsers);

        group.MapGet("/", async (ArticleAuthorshipService service) => Results.Ok(await service.ListUsersAsync()))
            .WithSummary("Every user with their role, for choosing article authors and managing roles. Admin only: it lists emails.")
            .Produces<List<UserSummaryDto>>();

        group.MapPut("/{id:int}/role", async (int id, UserRoleUpdateDto dto, ClaimsPrincipal user, UserAdminService service, CancellationToken cancellationToken) =>
                Results.Ok(await service.ChangeRoleAsync(id, dto.Role, user.GetUserId(), cancellationToken)))
            .WithSummary("Gives a user another role; it applies from their next request.")
            .WithDescription("Answers 400 last_admin_demotion when the user is the last admin, 404 user_not_found for an unknown user.")
            .Produces<UserSummaryDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound);

        return builder;
    }
}
