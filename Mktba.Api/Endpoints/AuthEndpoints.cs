using System.Security.Claims;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Api.Infrastructure;
using Mktba.Application.Services;

namespace Mktba.Api.Endpoints;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder builder)
    {
        var group = builder.MapGroup("/auth").WithTags("Auth");

        group.MapGet("/status", async (AdminAuthService service, CancellationToken cancellationToken) =>
        {
            var status = await service.GetAuthStatusAsync(cancellationToken);
            return Results.Ok(status);
        }).Produces<AdminAuthStatusDto>();

        group.MapPost("/register", async (
            AdminRegisterRequestDto request,
            HttpContext context,
            AdminAuthService service,
            CancellationToken cancellationToken) =>
        {
            var result = await service.RegisterAsync(request, RefreshCookie.Client(context), cancellationToken);
            return SignedIn(context, result, StatusCodes.Status400BadRequest);
        })
        .WithSummary("Registers the first user as admin, then anyone with an invite, who gets the invite's role.")
        .WithDescription(
            "Sets the refresh-token cookie as well. Once a user exists an invite token is required; it is single-use. "
            + "Answers 400 invite_not_found, invite_expired, invite_used or invite_revoked when it cannot be used. "
            + $"The password must be {PasswordRules.MinLength} to {PasswordRules.MaxLength} characters (Unicode code points), not the email and not one character repeated: "
            + "400 password_too_short, password_too_long or password_too_simple otherwise. Login does not apply these rules.")
        .Produces<AdminAuthResponseDto>().ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status429TooManyRequests)
        .RequireRateLimiting(RateLimitingSetup.AuthPolicy);

        group.MapPost("/login", async (
            AdminLoginRequestDto request,
            HttpContext context,
            AdminAuthService service,
            CancellationToken cancellationToken) =>
        {
            var result = await service.LoginAsync(request, RefreshCookie.Client(context), cancellationToken);
            return SignedIn(context, result, StatusCodes.Status400BadRequest);
        })
        .WithDescription("Sets the refresh-token cookie as well.")
        .Produces<AdminAuthResponseDto>().ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status429TooManyRequests)
        .RequireRateLimiting(RateLimitingSetup.AuthPolicy);

        group.MapPost("/refresh", async (HttpContext context, SessionService sessions, CancellationToken cancellationToken) =>
        {
            var result = await sessions.RefreshAsync(RefreshCookie.Read(context), RefreshCookie.Client(context), cancellationToken);
            return SignedIn(context, result, StatusCodes.Status401Unauthorized);
        })
        .WithSummary("Exchanges the refresh-token cookie for a new access token.")
        .WithDescription(
            "Rotates the refresh token: the cookie is replaced, and the old token stops working. Presenting a "
            + "token that was already rotated ends that device session. Requires the X-Requested-With header.")
        .Produces<AdminAuthResponseDto>()
        .ProducesApiProblem(StatusCodes.Status401Unauthorized, StatusCodes.Status403Forbidden, StatusCodes.Status429TooManyRequests)
        .RequireCsrfHeader()
        .RequireRateLimiting(RateLimitingSetup.SessionPolicy);

        group.MapPost("/logout", async (HttpContext context, SessionService sessions, CancellationToken cancellationToken) =>
        {
            await sessions.SignOutAsync(RefreshCookie.Read(context), cancellationToken);
            RefreshCookie.Delete(context);
            return Results.NoContent();
        })
        .WithSummary("Ends the session of the refresh-token cookie and clears the cookie.")
        .WithDescription("Access tokens of that session stop working too. Requires the X-Requested-With header.")
        .Produces(StatusCodes.Status204NoContent)
        .ProducesApiProblem(StatusCodes.Status403Forbidden, StatusCodes.Status429TooManyRequests)
        .RequireCsrfHeader()
        .RequireRateLimiting(RateLimitingSetup.SessionPolicy);

        group.MapPost("/logout-all", async (
            HttpContext context,
            ClaimsPrincipal principal,
            SessionService sessions,
            CancellationToken cancellationToken) =>
        {
            if (principal.GetUserId() is not int userId)
            {
                return ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized);
            }

            await sessions.SignOutEverywhereAsync(userId, cancellationToken);
            RefreshCookie.Delete(context);
            return Results.NoContent();
        })
        .WithSummary("Ends every session of the signed-in user, on every device.")
        .WithDescription("Every refresh token and every access token of the user stops working, this one included.")
        .Produces(StatusCodes.Status204NoContent)
        .ProducesApiProblem(StatusCodes.Status401Unauthorized)
        .RequireAuthorization(Policies.Authenticated);

        group.MapGet("/sessions", async (ClaimsPrincipal principal, SessionService sessions, CancellationToken cancellationToken) =>
        {
            if (principal.GetUserId() is not int userId)
            {
                return ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized);
            }

            return Results.Ok(await sessions.ListAsync(userId, CurrentSessionId(principal), cancellationToken));
        })
        .WithSummary("The signed-in user's devices: one live session each, most recently active first.")
        .Produces<List<SessionDto>>()
        .ProducesApiProblem(StatusCodes.Status401Unauthorized)
        .RequireAuthorization(Policies.Authenticated);

        group.MapDelete("/sessions/{id:guid}", async (
            Guid id,
            ClaimsPrincipal principal,
            SessionService sessions,
            CancellationToken cancellationToken) =>
        {
            if (principal.GetUserId() is not int userId)
            {
                return ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized);
            }

            var result = await sessions.EndSessionAsync(userId, id, cancellationToken);
            return result.IsSuccess
                ? Results.NoContent()
                : ApiProblemResults.Problem(StatusCodes.Status404NotFound, result.Error!);
        })
        .WithSummary("Ends one of the signed-in user's sessions.")
        .WithDescription("Its refresh token and access tokens stop working at once.")
        .Produces(StatusCodes.Status204NoContent)
        .ProducesApiProblem(StatusCodes.Status401Unauthorized, StatusCodes.Status404NotFound)
        .RequireAuthorization(Policies.Authenticated);

        group.MapGet("/me",async (ClaimsPrincipal principal, AdminAuthService service, CancellationToken cancellationToken) =>
        {
            var user = principal.GetUserId() is int userId
                ? await service.GetCurrentUserAsync(userId, cancellationToken)
                : null;
            return user is null
                ? ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized)
                : Results.Ok(user);
        })
        .WithSummary("The signed-in user and their current role.")
        .WithDescription("The role is read from the database, so it reflects a change made after the token was issued.")
        .Produces<CurrentUserDto>()
        .ProducesApiProblem(StatusCodes.Status401Unauthorized)
        .RequireAuthorization(Policies.Authenticated);

        return builder;
    }

    /// <summary>The access token in the body and the refresh token in the cookie, or the error with <paramref name="failureStatus"/>.</summary>
    private static IResult SignedIn(HttpContext context, AdminService.ServiceResult<IssuedSession> result, int failureStatus)
    {
        if (!result.IsSuccess)
        {
            if (failureStatus == StatusCodes.Status401Unauthorized)
            {
                RefreshCookie.Delete(context);
            }

            return ApiProblemResults.Problem(failureStatus, result.Error!);
        }

        RefreshCookie.Append(context, result.Value!);
        return Results.Ok(result.Value!.Auth);
    }

    private static Guid? CurrentSessionId(ClaimsPrincipal principal)
        => Guid.TryParse(principal.FindFirstValue(SessionService.SessionIdClaimType), out var id) ? id : null;
}
