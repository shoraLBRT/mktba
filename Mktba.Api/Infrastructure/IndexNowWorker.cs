using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.Services.IndexNow;

namespace Mktba.Api.Infrastructure;

/// <summary>
/// Sends the paths waiting in <see cref="IndexNowQueue"/> to IndexNow (O-12, #61): after the first
/// one arrives it waits <see cref="IndexNowOptions.BatchDelaySeconds"/>, then sends everything queued
/// so far, each path once. A failed send is logged and dropped — the sitemap still lists the page.
/// Without configuration the worker does not start.
/// </summary>
public sealed class IndexNowWorker : BackgroundService
{
    private readonly IndexNowQueue _queue;
    private readonly IIndexNowClient _client;
    private readonly IndexNowOptions _options;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<IndexNowWorker> _logger;

    public IndexNowWorker(
        IndexNowQueue queue,
        IIndexNowClient client,
        IOptions<IndexNowOptions> options,
        TimeProvider timeProvider,
        ILogger<IndexNowWorker> logger)
    {
        _queue = queue;
        _client = client;
        _options = options.Value;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.IsConfigured)
        {
            _logger.LogInformation("IndexNow is off: IndexNow:Key and IndexNow:SiteUrl are not both set.");
            return;
        }

        var batchDelay = TimeSpan.FromSeconds(Math.Max(0, _options.BatchDelaySeconds));
        try
        {
            while (await _queue.Reader.WaitToReadAsync(stoppingToken))
            {
                if (batchDelay > TimeSpan.Zero)
                {
                    await Task.Delay(batchDelay, _timeProvider, stoppingToken);
                }

                await SendQueuedAsync(stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    private async Task SendQueuedAsync(CancellationToken stoppingToken)
    {
        var paths = new HashSet<string>(StringComparer.Ordinal);
        while (paths.Count < IndexNowOptions.MaxUrlsPerRequest && _queue.Reader.TryRead(out var path))
        {
            paths.Add(path);
        }

        try
        {
            if (await _client.SubmitAsync(paths, stoppingToken))
            {
                _logger.LogInformation("IndexNow took {Count} URL(s).", paths.Count);
            }
            else
            {
                _logger.LogWarning("IndexNow refused {Count} URL(s); check IndexNow:Key and the key file.", paths.Count);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            _logger.LogWarning(exception, "IndexNow could not be reached; {Count} URL(s) dropped.", paths.Count);
        }
    }
}
