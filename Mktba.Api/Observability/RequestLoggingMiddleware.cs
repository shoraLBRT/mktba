namespace Mktba.Api.Observability;

/// <summary>
/// One structured line per request (X-05, #159): method, the matched route's template (never the
/// actual path or the query string, which may carry a search phrase or a token), status, duration
/// and trace id. No address, User-Agent, cookie or user data (D9). Health probes are not logged.
/// </summary>
public sealed class RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger, TimeProvider timeProvider)
{
    /// <summary>Route of a request no endpoint matched.</summary>
    public const string UnmatchedRoute = "(unmatched)";

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.Request.Path.StartsWithSegments("/health"))
        {
            await next(context);
            return;
        }

        var started = timeProvider.GetTimestamp();
        try
        {
            await next(context);
        }
        finally
        {
            var route = (context.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? UnmatchedRoute;
            var status = context.RequestAborted.IsCancellationRequested && !context.Response.HasStarted
                ? 499
                : context.Response.StatusCode;
            logger.Log(
                status >= StatusCodes.Status500InternalServerError ? LogLevel.Warning : LogLevel.Information,
                "HTTP {Method} {Route} responded {StatusCode} in {ElapsedMs:0} ms. TraceId: {TraceId}",
                context.Request.Method,
                route,
                status,
                timeProvider.GetElapsedTime(started).TotalMilliseconds,
                context.TraceIdentifier);
        }
    }
}
