using System.Security.Claims;
using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Notifications;

namespace Mktba.Api.Endpoints;

/// <summary>
/// The signed-in user's notifications (V-09, #125): the list with the unread count, marking read, and
/// which categories also come by email. Only ever the caller's own.
/// </summary>
public static class NotificationEndpoints
{
    public static IEndpointRouteBuilder MapNotificationEndpoints(this IEndpointRouteBuilder builder)
    {
        var group = builder.MapGroup("/notifications").WithTags("Notifications").RequireAuthorization(Policies.Authenticated);

        group.MapGet("/", async (bool? unread, int? page, int? pageSize, ClaimsPrincipal principal, NotificationService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.ListAsync(userId, unread == true, page ?? 1, pageSize ?? NotificationService.DefaultPageSize, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithSummary("The caller's notifications, newest first, with the number of unread ones.")
            .WithDescription("unread=true keeps the unread ones; page from 1, pageSize 1 to 100 (20 by default).")
            .Produces<NotificationPageDto>()
            .ProducesApiProblem(StatusCodes.Status401Unauthorized);

        group.MapGet("/unread-count", async (ClaimsPrincipal principal, NotificationService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.CountUnreadAsync(userId, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithSummary("How many of the caller's notifications are unread: the counter on the bell.")
            .Produces<NotificationUnreadCountDto>()
            .ProducesApiProblem(StatusCodes.Status401Unauthorized);

        group.MapPost("/{id:int}/read", async (int id, ClaimsPrincipal principal, NotificationService service, CancellationToken cancellationToken) =>
            {
                if (principal.GetUserId() is not int userId)
                {
                    return ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized);
                }

                await service.MarkReadAsync(userId, id, cancellationToken);
                return Results.NoContent();
            })
            .WithSummary("Marks one of the caller's notifications read; again changes nothing.")
            .WithDescription("404 notification_not_found also for another user's notification.")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesApiProblem(StatusCodes.Status401Unauthorized, StatusCodes.Status404NotFound);

        group.MapPost("/read-all", async (ClaimsPrincipal principal, NotificationService service, CancellationToken cancellationToken) =>
            {
                if (principal.GetUserId() is not int userId)
                {
                    return ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized);
                }

                await service.MarkAllReadAsync(userId, cancellationToken);
                return Results.NoContent();
            })
            .WithSummary("Marks every unread notification of the caller read.")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesApiProblem(StatusCodes.Status401Unauthorized);

        group.MapGet("/settings", async (ClaimsPrincipal principal, NotificationService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.GetSettingsAsync(userId, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithSummary("Which categories of notifications also come to the caller by email; all of them until changed.")
            .WithDescription("emailsSent says whether the site sends email at all now. In-app notifications are always on.")
            .Produces<NotificationSettingsDto>()
            .ProducesApiProblem(StatusCodes.Status401Unauthorized);

        group.MapPut("/settings", async (NotificationSettingsWriteDto dto, ClaimsPrincipal principal, NotificationService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.UpdateSettingsAsync(userId, dto, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithSummary("Replaces the caller's email choices. A change applies to notifications made after it.")
            .Produces<NotificationSettingsDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status401Unauthorized);

        return builder;
    }
}
