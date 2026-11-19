using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Services;

namespace Mktba.Api.Endpoints;

public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder builder)
    {
        var group = builder.MapGroup("/admin").WithTags("Admin").RequireAuthorization("AdminOnly");

        group.MapPost("/cleanup", async (AdminService service, CancellationToken cancellationToken) =>
        {
            var result = await service.CleanupDemoDataAsync(cancellationToken);
            return Results.Ok(result);
        }).Produces<AdminCleanupResultDto>();

        group.MapGet("/ai-settings", async (AdminService service, CancellationToken cancellationToken) =>
        {
            var result = await service.GetAiSettingsAsync(cancellationToken);
            return Results.Ok(result);
        }).Produces<AiProviderSettingsDto>();

        group.MapPut("/ai-settings", async (
            UpdateAiProviderSettingsDto request,
            AdminService service,
            CancellationToken cancellationToken) =>
        {
            var result = await service.UpdateAiSettingsAsync(request, cancellationToken);
            return result.IsSuccess
                ? Results.Ok(result.Value)
                : Results.BadRequest(new { message = result.ErrorMessage });
        }).Produces<AiProviderSettingsDto>().Produces(StatusCodes.Status400BadRequest);

        group.MapDelete("/ai-settings", async (AdminService service, CancellationToken cancellationToken) =>
        {
            var result = await service.ResetAiSettingsAsync(cancellationToken);
            return Results.Ok(result);
        }).Produces<AiProviderSettingsDto>();

        group.MapPost("/ai-style", async (
            AiStyleRequestDto request,
            AdminService service,
            CancellationToken cancellationToken) =>
        {
            var result = await service.StyleMarkdownAsync(request.Text, cancellationToken);
            return result.IsSuccess
                ? Results.Ok(result.Value)
                : Results.BadRequest(new { message = result.ErrorMessage });
        }).Produces<AiStyleResponseDto>().Produces(StatusCodes.Status400BadRequest).Produces(StatusCodes.Status429TooManyRequests)
        .RequireRateLimiting(RateLimitingSetup.AiPolicy);

        group.MapPost("/ai-check", async (AdminService service, CancellationToken cancellationToken) =>
        {
            var result = await service.CheckAiConnectionAsync(cancellationToken);
            return result.IsSuccess
                ? Results.Ok(result.Value)
                : Results.BadRequest(new { message = result.ErrorMessage });
        }).Produces<AiConnectionCheckResultDto>().Produces(StatusCodes.Status400BadRequest).Produces(StatusCodes.Status429TooManyRequests)
        .RequireRateLimiting(RateLimitingSetup.AiPolicy);

        return builder;
    }
}
