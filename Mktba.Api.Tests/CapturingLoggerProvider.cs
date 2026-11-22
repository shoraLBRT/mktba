using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace Mktba.Api.Tests;

/// <summary>Keeps every log entry the API writes, for tests of what is (and is not) logged.</summary>
internal sealed class CapturingLoggerProvider : ILoggerProvider
{
    private readonly ConcurrentQueue<CapturedLogEntry> _entries = new();

    public IReadOnlyList<CapturedLogEntry> Entries => _entries.ToArray();

    public ILogger CreateLogger(string categoryName) => new CapturingLogger(this, categoryName);

    public void Dispose()
    {
    }

    private sealed class CapturingLogger(CapturingLoggerProvider provider, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel != LogLevel.None;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            => provider._entries.Enqueue(new CapturedLogEntry(
                category,
                logLevel,
                formatter(state, exception),
                state as IReadOnlyList<KeyValuePair<string, object?>> ?? []));
    }
}

internal sealed record CapturedLogEntry(
    string Category,
    LogLevel Level,
    string Message,
    IReadOnlyList<KeyValuePair<string, object?>> Values)
{
    public object? Value(string name) => Values.FirstOrDefault(pair => pair.Key == name).Value;
}
