using System.Globalization;
using System.Net.Http.Json;
using System.Text;
using System.Threading.Channels;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.Services.Observability;

namespace Mktba.Api.Observability;

/// <summary>Where alerts go (X-05, #159). <see cref="TelegramAlertChannel"/> in the app; tests replace it.</summary>
public interface IAlertChannel
{
    bool IsConfigured { get; }

    /// <summary>Sends one message; throws when the channel refused it.</summary>
    Task SendAsync(string text, CancellationToken cancellationToken);
}

/// <summary>One log entry worth an alert, already redacted.</summary>
public sealed record AlertEntry(
    DateTimeOffset At,
    LogLevel Level,
    string Category,
    string Template,
    string Message,
    string? ExceptionType);

/// <summary>Bounded hand-over from the logger (which must never block) to <see cref="AlertWorker"/>; the oldest entry is dropped when full.</summary>
public sealed class AlertQueue
{
    private readonly Channel<AlertEntry> _channel = Channel.CreateBounded<AlertEntry>(
        new BoundedChannelOptions(200) { FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true });

    public bool TryWrite(AlertEntry entry) => _channel.Writer.TryWrite(entry);

    public ChannelReader<AlertEntry> Reader => _channel.Reader;
}

/// <summary>
/// Forwards entries at <see cref="AlertOptions.MinimumLevel"/> or above to <see cref="AlertQueue"/>.
/// Registered only when an alert channel is configured. Entries of the alert pipeline itself are
/// never forwarded, so a failing channel cannot feed itself.
/// </summary>
public sealed class AlertLoggerProvider(AlertQueue queue, TimeProvider timeProvider, LogLevel minimumLevel) : ILoggerProvider
{
    public const int MaxMessageLength = 1500;

    public ILogger CreateLogger(string categoryName) => new AlertLogger(queue, timeProvider, minimumLevel, categoryName);

    public void Dispose()
    {
    }

    private sealed class AlertLogger(AlertQueue queue, TimeProvider timeProvider, LogLevel minimumLevel, string category) : ILogger
    {
        private readonly bool _excluded = category.StartsWith(typeof(AlertWorker).Namespace + ".Alert", StringComparison.Ordinal)
            || category.StartsWith("System.Net.Http.HttpClient." + TelegramAlertChannel.HttpClientName, StringComparison.Ordinal);

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => !_excluded && logLevel != LogLevel.None && logLevel >= minimumLevel;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel))
            {
                return;
            }

            var template = state is IReadOnlyList<KeyValuePair<string, object?>> values
                ? values.FirstOrDefault(pair => pair.Key == "{OriginalFormat}").Value as string
                : null;
            var message = formatter(state, exception);
            if (exception is not null)
            {
                message += $"\n{exception.GetType().Name}: {exception.Message}";
            }

            queue.TryWrite(new AlertEntry(
                timeProvider.GetUtcNow(),
                logLevel,
                category,
                template ?? message,
                LogRedaction.Redact(message, MaxMessageLength),
                exception?.GetType().FullName));
        }
    }
}

/// <summary>
/// Decides which entries are sent: one per kind (category, template, exception type) per
/// <see cref="AlertOptions.ThrottleMinutes"/>, the repeats counted into the next message of that kind,
/// and at most <see cref="AlertOptions.MaxPerHour"/> messages in any 60 minutes.
/// </summary>
public sealed class AlertThrottle(AlertOptions options)
{
    private readonly Dictionary<string, (DateTimeOffset SentAt, int Suppressed)> _kinds = new(StringComparer.Ordinal);
    private readonly Queue<DateTimeOffset> _sent = new();

    /// <returns>The number of earlier repeats to mention, or null when the entry is not sent.</returns>
    public int? Admit(AlertEntry entry)
    {
        var key = $"{entry.Category}\n{entry.Template}\n{entry.ExceptionType}";
        var throttle = TimeSpan.FromMinutes(Math.Max(0, options.ThrottleMinutes));
        if (_kinds.TryGetValue(key, out var kind) && entry.At - kind.SentAt < throttle)
        {
            _kinds[key] = kind with { Suppressed = kind.Suppressed + 1 };
            return null;
        }

        while (_sent.Count > 0 && entry.At - _sent.Peek() >= TimeSpan.FromHours(1))
        {
            _sent.Dequeue();
        }

        if (options.MaxPerHour > 0 && _sent.Count >= options.MaxPerHour)
        {
            return null;
        }

        _sent.Enqueue(entry.At);
        _kinds[key] = (entry.At, 0);
        return kind.Suppressed;
    }
}

/// <summary>Drains <see cref="AlertQueue"/> through <see cref="AlertThrottle"/> to <see cref="IAlertChannel"/>.</summary>
public sealed class AlertWorker(
    AlertQueue queue,
    IAlertChannel channel,
    IOptions<AlertOptions> options,
    IHostEnvironment environment,
    ILogger<AlertWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!channel.IsConfigured)
        {
            return;
        }

        var throttle = new AlertThrottle(options.Value);
        var stand = string.IsNullOrWhiteSpace(options.Value.Stand) ? environment.EnvironmentName : options.Value.Stand.Trim();
        try
        {
            await foreach (var entry in queue.Reader.ReadAllAsync(stoppingToken))
            {
                if (throttle.Admit(entry) is not { } repeats)
                {
                    continue;
                }

                try
                {
                    await channel.SendAsync(Format(stand, entry, repeats), stoppingToken);
                }
                catch (Exception exception) when (exception is not OperationCanceledException || !stoppingToken.IsCancellationRequested)
                {
                    // Warning, not Error, and this category is never forwarded: no loop through the channel.
                    logger.LogWarning("Could not send an alert: {ExceptionType}.", exception.GetType().Name);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    public static string Format(string stand, AlertEntry entry, int repeats)
    {
        var text = new StringBuilder()
            .Append(CultureInfo.InvariantCulture, $"mktba {stand}: {entry.Level} in {entry.Category}")
            .Append('\n')
            .Append(entry.At.UtcDateTime.ToString("yyyy-MM-dd HH:mm:ss 'UTC'", CultureInfo.InvariantCulture))
            .Append('\n')
            .Append(entry.Message);
        if (repeats > 0)
        {
            text.Append(CultureInfo.InvariantCulture, $"\n(+{repeats} similar since the last alert)");
        }

        return text.ToString();
    }
}

/// <summary>
/// Telegram Bot API <c>sendMessage</c>. The token is part of the request URL, so this HTTP client
/// writes no logs of its own.
/// </summary>
public sealed class TelegramAlertChannel(IHttpClientFactory httpClientFactory, IOptions<AlertOptions> options) : IAlertChannel
{
    public const string HttpClientName = "alerts-telegram";

    private readonly TelegramAlertOptions _options = options.Value.Telegram;

    public bool IsConfigured => _options.IsConfigured;

    public async Task SendAsync(string text, CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient(HttpClientName);
        var url = $"{_options.ApiBaseUrl.TrimEnd('/')}/bot{_options.BotToken!.Trim()}/sendMessage";
        using var response = await client.PostAsJsonAsync(
            url,
            new { chat_id = _options.ChatId!.Trim(), text, disable_web_page_preview = true },
            cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException($"Telegram answered {(int)response.StatusCode}.", null, response.StatusCode);
        }
    }
}

public static class AlertSetup
{
    /// <summary>
    /// Registers the channel always (so tests can replace it) and, when it is configured, the logger
    /// provider and the worker. Unconfigured — the default — nothing is forwarded anywhere.
    /// </summary>
    public static IServiceCollection AddMktbaAlerts(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection(AlertOptions.SectionName);
        services.Configure<AlertOptions>(section);
        services.AddHttpClient(TelegramAlertChannel.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(15))
            .RemoveAllLoggers();
        services.AddSingleton<IAlertChannel, TelegramAlertChannel>();
        services.AddSingleton<AlertQueue>();
        services.AddHostedService<AlertWorker>();
        services.AddSingleton<ILoggerProvider>(provider =>
        {
            var options = provider.GetRequiredService<IOptions<AlertOptions>>().Value;
            var level = Enum.TryParse<LogLevel>(options.MinimumLevel, ignoreCase: true, out var parsed) ? parsed : LogLevel.Error;
            // Decided from the settings, not by resolving the channel: its HTTP client factory needs logging.
            return options.Telegram.IsConfigured
                ? new AlertLoggerProvider(provider.GetRequiredService<AlertQueue>(), provider.GetRequiredService<TimeProvider>(), level)
                : NullAlertLoggerProvider.Instance;
        });
        return services;
    }

    private sealed class NullAlertLoggerProvider : ILoggerProvider
    {
        public static readonly NullAlertLoggerProvider Instance = new();

        public ILogger CreateLogger(string categoryName) => Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance;

        public void Dispose()
        {
        }
    }
}
