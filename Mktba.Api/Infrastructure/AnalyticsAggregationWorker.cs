using Microsoft.Extensions.Options;
using Mktba.Api.Observability;
using Mktba.Application.Configuration;
using Mktba.Application.Services.Analytics;

namespace Mktba.Api.Infrastructure;

/// <summary>
/// Runs <see cref="AnalyticsAggregationService"/> (N-04, #98) once at start and then every
/// <see cref="AnalyticsOptions.AggregationIntervalMinutes"/>: rebuilds the daily summaries of the
/// days not final yet and removes raw events past the retention. A missed run loses nothing — the
/// next one starts from the last final day.
/// </summary>
public sealed class AnalyticsAggregationWorker : BackgroundService
{
    public const string HeartbeatName = "analytics-aggregation";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly TimeProvider _timeProvider;
    private readonly AnalyticsOptions _options;
    private readonly WorkerHeartbeats _heartbeats;
    private readonly ILogger<AnalyticsAggregationWorker> _logger;

    public AnalyticsAggregationWorker(
        IServiceScopeFactory scopeFactory,
        TimeProvider timeProvider,
        IOptions<AnalyticsOptions> options,
        WorkerHeartbeats heartbeats,
        ILogger<AnalyticsAggregationWorker> logger)
    {
        _heartbeats = heartbeats;
        _scopeFactory = scopeFactory;
        _timeProvider = timeProvider;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _heartbeats.Started(HeartbeatName, _options.AggregationInterval);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var run = await scope.ServiceProvider.GetRequiredService<AnalyticsAggregationService>().RunAsync(stoppingToken);
                if (run.EventsRemoved > 0)
                {
                    _logger.LogInformation("Removed {Count} raw analytics event(s) past the retention.", run.EventsRemoved);
                }

                _heartbeats.Succeeded(HeartbeatName);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                // The database being away must not end the worker for the life of the process.
                _heartbeats.Failed(HeartbeatName);
                _logger.LogError(exception, "Analytics aggregation failed.");
            }

            try
            {
                await Task.Delay(_options.AggregationInterval, _timeProvider, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
