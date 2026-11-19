using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Net.Http.Headers;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Api.Infrastructure;

internal sealed class JwtProblemEvents : JwtBearerEvents
{
    private const string AuthFailureItemKey = "auth.failure.reason";

    /// <summary>
    /// Takes the caller's role from the database instead of the token, so a role change applies at
    /// once and a token issued before roles existed (or for a deleted user) grants nothing it should
    /// not: no such user fails authentication (401), otherwise the stored role replaces any role claim.
    /// The token must also name a device session that is still live (U-03), so signing out — on one
    /// device or on all — ends the access tokens already issued, not only the refresh tokens.
    /// </summary>
    public override async Task TokenValidated(TokenValidatedContext context)
    {
        if (context.Principal?.Identity is not ClaimsIdentity identity
            || !int.TryParse(identity.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var userId))
        {
            context.Fail("The token does not name a user.");
            return;
        }

        if (!Guid.TryParse(identity.FindFirst(SessionService.SessionIdClaimType)?.Value, out var sessionId))
        {
            context.Fail("The token does not name a session.");
            return;
        }

        var services = context.HttpContext.RequestServices;
        var users = services.GetRequiredService<UserRepository>();
        var nowUtc = services.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime;
        var role = await users.GetRoleInActiveSessionAsync(userId, sessionId, nowUtc, context.HttpContext.RequestAborted);
        if (role is null)
        {
            context.Fail("The token's user no longer exists or its session has ended.");
            return;
        }

        foreach (var claim in identity.FindAll(identity.RoleClaimType).ToList())
        {
            identity.RemoveClaim(claim);
        }
        identity.AddClaim(new Claim(identity.RoleClaimType, role.Value.ToString()));
    }

    public override Task AuthenticationFailed(AuthenticationFailedContext context)
    {
        context.HttpContext.Items[AuthFailureItemKey] = context.Exception.GetType().Name;
        return Task.CompletedTask;
    }

    public override async Task Challenge(JwtBearerChallengeContext context)
    {
        if (context.Response.HasStarted)
        {
            return;
        }

        context.HandleResponse();
        context.Response.Headers.Remove(HeaderNames.WWWAuthenticate);

        var logger = context.HttpContext.RequestServices
            .GetRequiredService<ILoggerFactory>()
            .CreateLogger<JwtProblemEvents>();

        logger.LogWarning(
            "Unauthorized request. StatusCode: {StatusCode}, Method: {Method}, Path: {Path}, TraceId: {TraceId}, UserId: {UserId}, Failure: {Failure}",
            StatusCodes.Status401Unauthorized,
            context.Request.Method,
            context.Request.Path,
            context.HttpContext.TraceIdentifier,
            context.HttpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value,
            context.AuthenticateFailure?.GetType().Name
                ?? context.HttpContext.Items[AuthFailureItemKey]?.ToString()
                ?? "AuthenticationRequired");

        await ProblemHttpResponseWriter.WriteAsync(
            context.HttpContext,
            StatusCodes.Status401Unauthorized,
            AppErrors.Unauthorized);
    }

    public override async Task Forbidden(ForbiddenContext context)
    {
        if (context.Response.HasStarted)
        {
            return;
        }

        var logger = context.HttpContext.RequestServices
            .GetRequiredService<ILoggerFactory>()
            .CreateLogger<JwtProblemEvents>();

        logger.LogWarning(
            "Forbidden request. StatusCode: {StatusCode}, Method: {Method}, Path: {Path}, TraceId: {TraceId}, UserId: {UserId}",
            StatusCodes.Status403Forbidden,
            context.Request.Method,
            context.Request.Path,
            context.HttpContext.TraceIdentifier,
            context.HttpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value);

        await ProblemHttpResponseWriter.WriteAsync(
            context.HttpContext,
            StatusCodes.Status403Forbidden,
            AppErrors.Forbidden);
    }
}
