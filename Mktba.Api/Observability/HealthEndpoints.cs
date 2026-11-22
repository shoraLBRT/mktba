using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Mktba.Api.Observability;

/// <summary>
/// Liveness and readiness (X-05, #159; README «Наблюдаемость»). Public and outside the OpenAPI
/// contract: the deployment's healthchecks and an outside uptime monitor call them.
/// <list type="bullet">
/// <item><c>GET /health/live</c> — the process serves requests; checks nothing else, always 200.</item>
/// <item><c>GET /health/ready</c> — the database is reachable and fully migrated (else 503) and the
/// periodic workers' last runs (Degraded, still 200).</item>
/// </list>
/// Body: <c>{ status, checks: { name: { status, description } } }</c>, never an exception's text.
/// </summary>
public static class HealthEndpoints
{
    public const string LivePath = "/health/live";
    public const string ReadyPath = "/health/ready";
    private const string ReadyTag = "ready";

    public static IServiceCollection AddMktbaHealthChecks(this IServiceCollection services)
    {
        services.AddSingleton<WorkerHeartbeats>();
        services.AddHealthChecks()
            .AddCheck<DatabaseHealthCheck>("database", tags: [ReadyTag])
            .AddCheck<WorkerHealthCheck>("workers", tags: [ReadyTag]);
        return services;
    }

    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder builder)
    {
        builder.MapGet(LivePath, (HealthCheckService health, HttpContext context, CancellationToken ct)
                => WriteAsync(health, context, _ => false, ct))
            .ExcludeFromDescription()
            .AllowAnonymous();

        builder.MapGet(ReadyPath, (HealthCheckService health, HttpContext context, CancellationToken ct)
                => WriteAsync(health, context, check => check.Tags.Contains(ReadyTag), ct))
            .ExcludeFromDescription()
            .AllowAnonymous();

        return builder;
    }

    private static async Task<IResult> WriteAsync(
        HealthCheckService health, HttpContext context, Func<HealthCheckRegistration, bool> predicate, CancellationToken ct)
    {
        var report = await health.CheckHealthAsync(predicate, ct);
        context.Response.Headers.CacheControl = "no-store";
        var body = new
        {
            status = report.Status.ToString(),
            checks = report.Entries.ToDictionary(
                entry => entry.Key,
                entry => new { status = entry.Value.Status.ToString(), description = entry.Value.Description }),
        };
        return Results.Json(
            body,
            statusCode: report.Status == HealthStatus.Unhealthy
                ? StatusCodes.Status503ServiceUnavailable
                : StatusCodes.Status200OK);
    }
}
