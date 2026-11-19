using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.Services.Feedback;

namespace Mktba.Api.Infrastructure;

/// <summary>
/// Looks at the feedback queue every <see cref="FeedbackDeliveryOptions.PollIntervalSeconds"/> and
/// delivers what is due (F-02, #67). While GitHub is unavailable the pause doubles with every failed
/// look, up to <see cref="FeedbackDeliveryOptions.RetryMaxSeconds"/>. Without a configured GitHub
/// App the worker does not start: feedback is stored and waits as <c>Pending</c>.
/// </summary>
public sealed class FeedbackDeliveryWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IFeedbackIssueTracker _tracker;
    private readonly FeedbackDeliveryOptions _options;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<FeedbackDeliveryWorker> _logger;

    public FeedbackDeliveryWorker(
        IServiceScopeFactory scopeFactory,
        IFeedbackIssueTracker tracker,
        IOptions<FeedbackOptions> options,
        TimeProvider timeProvider,
        ILogger<FeedbackDeliveryWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _tracker = tracker;
        _options = options.Value.Delivery;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_tracker.IsConfigured)
        {
            _logger.LogInformation(
                "Feedback delivery is off: the GitHub App is not configured (Feedback:GitHub). Feedback is stored and stays pending.");
            return;
        }

        var pollInterval = TimeSpan.FromSeconds(Math.Max(1, _options.PollIntervalSeconds));
        var failedRuns = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var run = await scope.ServiceProvider.GetRequiredService<FeedbackDeliveryService>().DeliverDueAsync(stoppingToken);
                failedRuns = run.TrackerUnavailable ? failedRuns + 1 : 0;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                // The database being away must not end the worker for the life of the process.
                failedRuns++;
                _logger.LogError(exception, "Feedback delivery run failed.");
            }

            var pause = failedRuns == 0 ? pollInterval : Max(pollInterval, _options.RetryDelay(failedRuns));
            try
            {
                await Task.Delay(pause, _timeProvider, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private static TimeSpan Max(TimeSpan first, TimeSpan second) => first > second ? first : second;
}
