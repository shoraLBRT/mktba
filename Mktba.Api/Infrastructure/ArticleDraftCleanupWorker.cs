using Mktba.Application.Services;

namespace Mktba.Api.Infrastructure;

/// <summary>
/// Deletes autosaved drafts nobody has written for <see cref="ArticleDraftService.Lifetime"/>
/// (E-02, #75): once at start and then every <see cref="Interval"/>. Such a draft is already
/// treated as gone before that, so the timing only bounds how long the row stays in the database.
/// </summary>
public sealed class ArticleDraftCleanupWorker : BackgroundService
{
    public static readonly TimeSpan Interval = TimeSpan.FromHours(6);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<ArticleDraftCleanupWorker> _logger;

    public ArticleDraftCleanupWorker(IServiceScopeFactory scopeFactory, TimeProvider timeProvider, ILogger<ArticleDraftCleanupWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var removed = await scope.ServiceProvider.GetRequiredService<ArticleDraftService>().DeleteExpiredAsync(stoppingToken);
                if (removed > 0)
                {
                    _logger.LogInformation("Deleted {Count} abandoned article draft(s).", removed);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                // The database being away must not end the worker for the life of the process.
                _logger.LogError(exception, "Article draft cleanup failed.");
            }

            try
            {
                await Task.Delay(Interval, _timeProvider, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
