namespace Mktba.Api.Infrastructure;

/// <summary>
/// Security headers on every API response (X-06, #160). The API answers JSON and its own files, never
/// a page to render, so the policy is the strictest one: nothing loads, nothing frames it, no referrer.
/// HSTS is sent by the reverse proxy that terminates TLS (<c>deploy/Caddyfile</c>), not here.
/// </summary>
internal static class SecurityHeadersSetup
{
    public const string ContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

    /// <summary>
    /// Adds the headers when the response starts, so error responses get them too. A header an endpoint
    /// set itself wins (<c>GET /files/{name}</c> has its own CSP). Swagger UI (Development only) is a page
    /// with scripts and styles, so it gets no CSP.
    /// </summary>
    public static IApplicationBuilder UseMktbaSecurityHeaders(this IApplicationBuilder app) =>
        app.Use((context, next) =>
        {
            var isSwagger = context.Request.Path.StartsWithSegments("/swagger");
            context.Response.OnStarting(() =>
            {
                var headers = context.Response.Headers;
                headers.TryAdd("X-Content-Type-Options", "nosniff");
                headers.TryAdd("X-Frame-Options", "DENY");
                headers.TryAdd("Referrer-Policy", "no-referrer");
                if (!isSwagger)
                {
                    headers.TryAdd("Content-Security-Policy", ContentSecurityPolicy);
                }

                return Task.CompletedTask;
            });
            return next(context);
        });
}
