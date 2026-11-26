using System.Globalization;
using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Mktba.Application.Exceptions;

namespace Mktba.Api.Infrastructure;

/// <summary>
/// Limits for the <c>RateLimiting</c> configuration section (S-10, #12).
/// Each limit is a fixed window: at most <see cref="RateLimitRule.PermitLimit"/> requests
/// per <see cref="RateLimitRule.WindowSeconds"/> seconds per partition.
/// </summary>
public sealed class RateLimitingOptions
{
    public const string SectionName = "RateLimiting";

    /// <summary>Anonymous credential endpoints (<c>/auth/login</c>, <c>/auth/register</c>), partitioned by client IP.</summary>
    public RateLimitRule Auth { get; set; } = new() { PermitLimit = 10, WindowSeconds = 60 };

    /// <summary>Session renewal and sign-out (<c>/auth/refresh</c>, <c>/auth/logout</c>), partitioned by client IP. Every page load of a signed-in user renews once.</summary>
    public RateLimitRule Session { get; set; } = new() { PermitLimit = 60, WindowSeconds = 60 };

    /// <summary>Paid AI provider calls (<c>/admin/ai-style</c>, <c>/admin/ai-check</c>), partitioned by user id.</summary>
    public RateLimitRule Ai { get; set; } = new() { PermitLimit = 20, WindowSeconds = 3600 };

    /// <summary>
    /// Anonymous feedback (<c>POST /feedback</c>, F-03 #68), partitioned by client IP. The address
    /// only keys the limiter's in-memory window: it is neither stored nor logged (decision D9).
    /// The cap on all visitors together is <c>Feedback:Intake:MaxPerHour</c>.
    /// </summary>
    public RateLimitRule Feedback { get; set; } = new() { PermitLimit = 5, WindowSeconds = 600 };

    /// <summary>File uploads (<c>/uploads/*</c>, U-08 #73), partitioned by user id (by client IP for a request without one).</summary>
    public RateLimitRule Uploads { get; set; } = new() { PermitLimit = 30, WindowSeconds = 3600 };

    /// <summary>
    /// Reader events (<c>POST /analytics/events</c>, N-02 #96), partitioned by client IP. A page sends
    /// a batch every few seconds at most; the address only keys the limiter's in-memory window.
    /// </summary>
    public RateLimitRule Analytics { get; set; } = new() { PermitLimit = 60, WindowSeconds = 60 };

    /// <summary>
    /// Browser error reports (<c>POST /client-errors</c>, X-05 #159), partitioned by client IP. The
    /// script sends a few per page at most; the address only keys the limiter's in-memory window.
    /// </summary>
    public RateLimitRule ClientErrors { get; set; } = new() { PermitLimit = 10, WindowSeconds = 60 };

    /// <summary>
    /// Requests that queue an account email (<c>/auth/sign-up</c>, <c>/auth/password-reset</c>,
    /// <c>/auth/confirm-email/resend</c>; U-05 #126), partitioned by client IP. Each account also takes
    /// at most <c>Auth:AccountEmailsPerHour</c> emails of a kind, whoever asks.
    /// </summary>
    public RateLimitRule AccountEmail { get; set; } = new() { PermitLimit = 5, WindowSeconds = 900 };
}

public sealed class RateLimitRule
{
    public int PermitLimit { get; set; }

    public int WindowSeconds { get; set; }
}

internal static class RateLimitingSetup
{
    public const string AuthPolicy = "auth";
    public const string SessionPolicy = "session";
    public const string AiPolicy = "ai";
    public const string FeedbackPolicy = "feedback";
    public const string UploadPolicy = "uploads";
    public const string AnalyticsPolicy = "analytics";
    public const string ClientErrorsPolicy = "client-errors";
    public const string AccountEmailPolicy = "account-email";

    public static IServiceCollection AddMktbaRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var options = configuration.GetSection(RateLimitingOptions.SectionName).Get<RateLimitingOptions>() ?? new RateLimitingOptions();

        return services.AddRateLimiter(limiter =>
        {
            limiter.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            // The client IP is the socket address unless the request came through a proxy listed in
            // the ForwardedHeaders section (ForwardedHeadersSetup): X-Forwarded-For from anyone else
            // is not trusted.
            limiter.AddPolicy(AuthPolicy, context => FixedWindow(
                "ip:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
                options.Auth));

            limiter.AddPolicy(SessionPolicy, context => FixedWindow(
                "ip:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
                options.Session));

            limiter.AddPolicy(FeedbackPolicy, context => FixedWindow(
                "ip:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
                options.Feedback));

            limiter.AddPolicy(AnalyticsPolicy, context => FixedWindow(
                "ip:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
                options.Analytics));

            limiter.AddPolicy(ClientErrorsPolicy, context => FixedWindow(
                "ip:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
                options.ClientErrors));

            limiter.AddPolicy(AccountEmailPolicy, context => FixedWindow(
                "ip:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
                options.AccountEmail));

            limiter.AddPolicy(AiPolicy, context => FixedWindow(UserOrIp(context), options.Ai));

            limiter.AddPolicy(UploadPolicy, context => FixedWindow(UserOrIp(context), options.Uploads));

            limiter.OnRejected = (context, cancellationToken) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                {
                    context.HttpContext.Response.Headers.RetryAfter =
                        Math.Ceiling(retryAfter.TotalSeconds).ToString(CultureInfo.InvariantCulture);
                }

                return new ValueTask(ProblemHttpResponseWriter.WriteAsync(
                    context.HttpContext,
                    StatusCodes.Status429TooManyRequests,
                    AppErrors.TooManyRequests,
                    cancellationToken));
            };
        });
    }

    private static string UserOrIp(HttpContext context)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        return userId is not null
            ? "user:" + userId
            : "ip:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown");
    }

    private static RateLimitPartition<string> FixedWindow(string partitionKey, RateLimitRule rule) =>
        RateLimitPartition.GetFixedWindowLimiter(partitionKey, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = rule.PermitLimit,
            Window = TimeSpan.FromSeconds(rule.WindowSeconds),
            QueueLimit = 0,
        });
}
