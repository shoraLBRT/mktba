using System.Globalization;
using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

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

    /// <summary>Paid AI provider calls (<c>/admin/ai-style</c>, <c>/admin/ai-check</c>), partitioned by user id.</summary>
    public RateLimitRule Ai { get; set; } = new() { PermitLimit = 20, WindowSeconds = 3600 };
}

public sealed class RateLimitRule
{
    public int PermitLimit { get; set; }

    public int WindowSeconds { get; set; }
}

internal static class RateLimitingSetup
{
    public const string AuthPolicy = "auth";
    public const string AiPolicy = "ai";

    public static IServiceCollection AddMktbaRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var options = configuration.GetSection(RateLimitingOptions.SectionName).Get<RateLimitingOptions>() ?? new RateLimitingOptions();

        return services.AddRateLimiter(limiter =>
        {
            limiter.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            // The client IP is the socket address: no forwarded-headers middleware is configured,
            // so X-Forwarded-For is deliberately not trusted.
            limiter.AddPolicy(AuthPolicy, context => FixedWindow(
                "ip:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
                options.Auth));

            limiter.AddPolicy(AiPolicy, context =>
            {
                var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
                var partition = userId is not null
                    ? "user:" + userId
                    : "ip:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown");
                return FixedWindow(partition, options.Ai);
            });

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
                    "too_many_requests",
                    "Too many requests. Try again later.",
                    cancellationToken));
            };
        });
    }

    private static RateLimitPartition<string> FixedWindow(string partitionKey, RateLimitRule rule) =>
        RateLimitPartition.GetFixedWindowLimiter(partitionKey, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = rule.PermitLimit,
            Window = TimeSpan.FromSeconds(rule.WindowSeconds),
            QueueLimit = 0,
        });
}
