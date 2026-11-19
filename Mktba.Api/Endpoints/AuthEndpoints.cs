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
            AdminAuthService service,
            CancellationToken cancellationToken) =>
        {
            var result = await service.RegisterAsync(request, cancellationToken);
            return result.IsSuccess
                ? Results.Ok(result.Value)
                : ApiProblemResults.Problem(StatusCodes.Status400BadRequest, result.Error!);
        }).Produces<AdminAuthResponseDto>().ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status429TooManyRequests)
        .RequireRateLimiting(RateLimitingSetup.AuthPolicy);

        group.MapPost("/login", async (
            AdminLoginRequestDto request,
            AdminAuthService service,
            CancellationToken cancellationToken) =>
        {
            var result = await service.LoginAsync(request, cancellationToken);
            return result.IsSuccess
                ? Results.Ok(result.Value)
                : ApiProblemResults.Problem(StatusCodes.Status400BadRequest, result.Error!);
        }).Produces<AdminAuthResponseDto>().ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status429TooManyRequests)
        .RequireRateLimiting(RateLimitingSetup.AuthPolicy);

        group.MapPost("/invite-token", async (
            ClaimsPrincipal principal,
            AdminAuthService service,
            CancellationToken cancellationToken) =>
        {
            var adminIdClaim = principal.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!int.TryParse(adminIdClaim, out var adminId))
            {
                return ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized);
            }

            var result = await service.GenerateInviteTokenAsync(adminId, cancellationToken);
            return result.IsSuccess
                ? Results.Ok(result.Value)
                : ApiProblemResults.Problem(StatusCodes.Status400BadRequest, result.Error!);
        }).Produces<AdminInviteTokenCreateResponseDto>().ProducesApiProblem(StatusCodes.Status400BadRequest).RequireAuthorization("AdminOnly");

        return builder;
    }
}
