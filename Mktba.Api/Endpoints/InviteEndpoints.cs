using System.Security.Claims;
using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;

namespace Mktba.Api.Endpoints;

/// <summary>Invites with a role (U-04, #32). Admin only; registering with one is <c>POST /auth/register</c>.</summary>
public static class InviteEndpoints
{
    public static IEndpointRouteBuilder MapInviteEndpoints(this IEndpointRouteBuilder builder)
    {
        var group = builder.MapGroup("/invites").WithTags("Invites").RequireAuthorization(Policies.CanManageUsers);

        group.MapGet("/", async (InviteService service, CancellationToken cancellationToken) =>
                Results.Ok(await service.ListAsync(cancellationToken)))
            .WithSummary("Every invite, newest first, with its status. Never carries a token.")
            .Produces<List<InviteDto>>();

        group.MapPost("/", async (InviteCreateRequestDto request, ClaimsPrincipal principal, InviteService service) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.CreateAsync(userId, request))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithSummary("Creates a single-use invite for a role. The token is in this response only; the server keeps its hash.")
            .WithDescription("Answers 400 role_invalid, invite_lifetime_invalid or invite_note_too_long.")
            .Produces<InviteCreatedDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest);

        group.MapPost("/{id:int}/revoke", async (int id, InviteService service) =>
            {
                await service.RevokeAsync(id);
                return Results.NoContent();
            })
            .WithSummary("Revokes an unused invite; revoking it again changes nothing.")
            .WithDescription("Answers 400 invite_used when someone already registered with it, 404 invite_not_found.")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound);

        return builder;
    }
}
