using System.Globalization;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Observability;

/// <summary>
/// Readiness of the database (X-05, #159): reachable and with no migration left to apply. Unhealthy
/// fails readiness (503). The description never carries the connection string or the exception text.
/// </summary>
public sealed class DatabaseHealthCheck(MktbaDbContext context) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext healthContext, CancellationToken cancellationToken = default)
    {
        try
        {
            if (!await context.Database.CanConnectAsync(cancellationToken))
            {
                return HealthCheckResult.Unhealthy("The database is unreachable.");
            }

            var pending = await DatabaseMigrator.GetPendingMigrationsAsync(context, cancellationToken);
            return pending.Count == 0
                ? HealthCheckResult.Healthy("Reachable, no pending migrations.")
                : HealthCheckResult.Unhealthy($"{pending.Count} pending migration(s).");
        }
        catch (Exception exception) when (exception is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            return HealthCheckResult.Unhealthy("The database is unreachable.");
        }
    }
}

/// <summary>
/// The periodic hosted workers (<see cref="WorkerHeartbeats"/>). Degraded — readiness still answers
/// 200 — when a worker's last run failed or it has not succeeded for <see cref="StaleAfterIntervals"/>
/// of its intervals: the site serves, but something in the background needs a look.
/// </summary>
public sealed class WorkerHealthCheck(WorkerHeartbeats heartbeats, TimeProvider timeProvider) : IHealthCheck
{
    public const int StaleAfterIntervals = 3;

    /// <summary>Slack on top of the intervals: a run itself takes time.</summary>
    public static readonly TimeSpan Grace = TimeSpan.FromMinutes(5);

    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        var now = timeProvider.GetUtcNow();
        var workers = heartbeats.Snapshot();
        var problems = new List<string>();
        foreach (var worker in workers)
        {
            if (worker.LastRunFailed)
            {
                problems.Add($"{worker.Name}: the last run failed at {Format(worker.LastFailureAt!.Value)}");
                continue;
            }

            var since = worker.LastSuccessAt ?? worker.StartedAt;
            if (worker.Interval > TimeSpan.Zero && now - since > worker.Interval * StaleAfterIntervals + Grace)
            {
                problems.Add(worker.LastSuccessAt is null
                    ? $"{worker.Name}: no successful run since the start at {Format(since)}"
                    : $"{worker.Name}: no successful run since {Format(since)}");
            }
        }

        if (problems.Count > 0)
        {
            return Task.FromResult(HealthCheckResult.Degraded(string.Join("; ", problems) + "."));
        }

        return Task.FromResult(HealthCheckResult.Healthy(workers.Count == 0
            ? "No periodic worker is running."
            : "Running: " + string.Join(", ", workers.Select(worker => worker.Name)) + "."));
    }

    private static string Format(DateTimeOffset moment) => moment.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);
}
