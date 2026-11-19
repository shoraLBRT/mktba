using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;

namespace Mktba.Api.Infrastructure;

/// <summary>
/// The refresh-token cookie (U-03, #31): <c>HttpOnly</c> so scripts never see it, <c>SameSite=Strict</c>
/// so no other site's page sends it, <c>Secure</c> everywhere but Development (local http), and
/// scoped to the auth endpoints' path so no other request carries it.
/// </summary>
internal static class RefreshCookie
{
    public const string Name = "mktba_refresh";

    /// <summary>
    /// Header that refresh and logout require (CSRF guard on top of SameSite): a page on another
    /// origin can set it only after a CORS preflight, which the API refuses for origins it does not allow.
    /// </summary>
    public const string CsrfHeader = "X-Requested-With";

    public static void Append(HttpContext context, IssuedSession session)
        => context.Response.Cookies.Append(Name, session.RefreshToken, Options(context, session.RefreshTokenExpiresAtUtc));

    public static void Delete(HttpContext context)
        => context.Response.Cookies.Delete(Name, Options(context, expiresAtUtc: null));

    public static string? Read(HttpContext context) => context.Request.Cookies[Name];

    /// <summary>The device a request comes from, recorded with the session it starts.</summary>
    public static SessionClient Client(HttpContext context)
        => new(context.Request.Headers.UserAgent.ToString(), context.Connection.RemoteIpAddress?.ToString());

    /// <summary>Refuses (403) a request without <see cref="CsrfHeader"/>.</summary>
    public static RouteHandlerBuilder RequireCsrfHeader(this RouteHandlerBuilder builder)
        => builder.AddEndpointFilter(async (invocation, next) =>
            string.IsNullOrWhiteSpace(invocation.HttpContext.Request.Headers[CsrfHeader])
                ? ApiProblemResults.Problem(StatusCodes.Status403Forbidden, AppErrors.SessionCsrfHeaderMissing)
                : await next(invocation));

    private static CookieOptions Options(HttpContext context, DateTime? expiresAtUtc)
    {
        var services = context.RequestServices;
        return new CookieOptions
        {
            HttpOnly = true,
            Secure = !services.GetRequiredService<IHostEnvironment>().IsDevelopment(),
            SameSite = SameSiteMode.Strict,
            Path = services.GetRequiredService<IOptions<AuthOptions>>().Value.RefreshCookiePath,
            Expires = expiresAtUtc is null ? null : new DateTimeOffset(expiresAtUtc.Value, TimeSpan.Zero),
            IsEssential = true,
        };
    }
}
