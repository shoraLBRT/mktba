using System.Collections.Concurrent;

namespace Mktba.Api.Observability;

/// <summary>
/// What the periodic hosted workers last did (X-05, #159), for readiness
/// (<see cref="WorkerHealthCheck"/>). A worker registers itself with its interval when it starts and
/// reports every run; a worker that never started (not configured) is simply absent.
/// </summary>
public sealed class WorkerHeartbeats(TimeProvider timeProvider)
{
    private readonly ConcurrentDictionary<string, WorkerHeartbeat> _workers = new(StringComparer.Ordinal);

    /// <summary>Called once when the worker starts; <paramref name="interval"/> is its longest regular pause.</summary>
    public void Started(string worker, TimeSpan interval)
        => _workers[worker] = new WorkerHeartbeat(worker, interval, timeProvider.GetUtcNow(), null, null, false);

    public void Succeeded(string worker)
        => Update(worker, heartbeat => heartbeat with { LastSuccessAt = timeProvider.GetUtcNow(), LastRunFailed = false });

    public void Failed(string worker)
        => Update(worker, heartbeat => heartbeat with { LastFailureAt = timeProvider.GetUtcNow(), LastRunFailed = true });

    public IReadOnlyList<WorkerHeartbeat> Snapshot() => _workers.Values.OrderBy(worker => worker.Name, StringComparer.Ordinal).ToList();

    private void Update(string worker, Func<WorkerHeartbeat, WorkerHeartbeat> change)
        => _workers.AddOrUpdate(
            worker,
            name => change(new WorkerHeartbeat(name, TimeSpan.Zero, timeProvider.GetUtcNow(), null, null, false)),
            (_, heartbeat) => change(heartbeat));
}

public sealed record WorkerHeartbeat(
    string Name,
    TimeSpan Interval,
    DateTimeOffset StartedAt,
    DateTimeOffset? LastSuccessAt,
    DateTimeOffset? LastFailureAt,
    bool LastRunFailed);
