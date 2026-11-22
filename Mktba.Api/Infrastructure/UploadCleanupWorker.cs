using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.Services.Uploads;

namespace Mktba.Api.Infrastructure;

/// <summary>
/// Runs <see cref="UploadCleanupService"/> (U-08, #73) once at start and then every
/// <see cref="UploadCleanupOptions.IntervalHours"/>. The grace period is days long, so the timing
/// only bounds how late a file is marked or removed.
/// </summary>
public sealed class UploadCleanupWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly TimeProvider _timeProvider;
    private readonly UploadCleanupOptions _options;
    private readonly ILogger<UploadCleanupWorker> _logger;

    public UploadCleanupWorker(
        IServiceScopeFactory scopeFactory,
        TimeProvider timeProvider,
        IOptions<UploadOptions> options,
        ILogger<UploadCleanupWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _timeProvider = timeProvider;
        _options = options.Value.Cleanup;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                await scope.ServiceProvider.GetRequiredService<UploadCleanupService>().RunAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                // The database or the storage being away must not end the worker for the life of the process.
                _logger.LogError(exception, "Upload cleanup failed.");
            }

            try
            {
                await Task.Delay(_options.Interval, _timeProvider, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
