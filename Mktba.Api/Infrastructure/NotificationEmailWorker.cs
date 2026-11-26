using Microsoft.Extensions.Options;
using Mktba.Api.Observability;
using Mktba.Application.Configuration;
using Mktba.Application.Services.Accounts;
using Mktba.Application.Services.Notifications;

namespace Mktba.Api.Infrastructure;

/// <summary>
/// Looks at the notification email outbox every <see cref="EmailDeliveryOptions.PollIntervalSeconds"/>
/// and sends what is due (V-09, #125), account emails (confirmation, password reset; U-05 #126) first. While the mail server is unavailable the pause doubles with
/// every failed look, up to <see cref="EmailDeliveryOptions.RetryMaxSeconds"/>. Without a configured
/// server it still runs: the emails go to the log (<c>LogEmailSender</c>) and leave the outbox.
/// </summary>
public sealed class NotificationEmailWorker : BackgroundService
{
    public const string HeartbeatName = "notification-email";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly EmailOptions _options;
    private readonly TimeProvider _timeProvider;
    private readonly WorkerHeartbeats _heartbeats;
    private readonly ILogger<NotificationEmailWorker> _logger;

    public NotificationEmailWorker(
        IServiceScopeFactory scopeFactory,
        IOptions<EmailOptions> options,
        TimeProvider timeProvider,
        WorkerHeartbeats heartbeats,
        ILogger<NotificationEmailWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _options = options.Value;
        _timeProvider = timeProvider;
        _heartbeats = heartbeats;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.SendsThroughSmtp)
        {
            _logger.LogInformation("Notification emails go to the log: no mail server is configured (Email:Smtp, Email:SiteUrl).");
        }

        var delivery = _options.Delivery;
        var pollInterval = TimeSpan.FromSeconds(Math.Max(1, delivery.PollIntervalSeconds));
        var failedRuns = 0;
        _heartbeats.Started(HeartbeatName, pollInterval);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                // Account emails first (U-05, #126): someone is waiting for the link. A server that is
                // away for them is away for the notifications too.
                var run = await scope.ServiceProvider.GetRequiredService<AccountEmailService>().SendDueAsync(stoppingToken);
                if (!run.ServerUnavailable)
                {
                    run = await scope.ServiceProvider.GetRequiredService<NotificationEmailService>().SendDueAsync(stoppingToken);
                }

                failedRuns = run.ServerUnavailable ? failedRuns + 1 : 0;
                if (run.ServerUnavailable)
                {
                    _heartbeats.Failed(HeartbeatName);
                }
                else
                {
                    _heartbeats.Succeeded(HeartbeatName);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                // The database being away must not end the worker for the life of the process.
                failedRuns++;
                _heartbeats.Failed(HeartbeatName);
                _logger.LogError(exception, "Notification email run failed.");
            }

            var pause = failedRuns == 0 ? pollInterval : Max(pollInterval, delivery.RetryDelay(failedRuns));
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
