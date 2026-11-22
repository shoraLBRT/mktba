using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;

namespace Mktba.Application.Services.Observability;

/// <summary>
/// Browser error reports (X-05, #159): cleaned (<see cref="LogRedaction"/>) and written to the log
/// as one Warning entry of the category <c>Mktba.ClientErrors</c>. Nothing is stored in the
/// database; no address, User-Agent or account is attached (D9). Beyond
/// <see cref="ClientErrorOptions.MaxPerMinute"/> in a minute, reports are dropped.
/// </summary>
public sealed class ClientErrorService
{
    public const string LogCategory = "Mktba.ClientErrors";
    public const int MaxMessageLength = 1000;
    public const int MaxStackLength = 4000;
    public const int MaxPageLength = 300;

    private static readonly string[] Kinds = ["error", "rejection", "render"];

    private readonly ILogger _logger;
    private readonly TimeProvider _timeProvider;
    private readonly int _maxPerMinute;
    private readonly object _gate = new();
    private long _minute = -1;
    private int _countThisMinute;

    public ClientErrorService(ILoggerFactory loggerFactory, TimeProvider timeProvider, IOptions<ClientErrorOptions> options)
    {
        _logger = loggerFactory.CreateLogger(LogCategory);
        _timeProvider = timeProvider;
        _maxPerMinute = options.Value.MaxPerMinute;
    }

    /// <returns>Whether the report was logged (false: over the cap).</returns>
    public bool Report(ClientErrorReportDto report)
    {
        if (!TryTakeSlot())
        {
            return false;
        }

        var kind = Kinds.FirstOrDefault(known => string.Equals(known, report.Kind?.Trim(), StringComparison.OrdinalIgnoreCase)) ?? "error";
        var message = LogRedaction.Redact(report.Message, MaxMessageLength);
        _logger.LogWarning(
            "Client {Kind} on {Page}: {ErrorMessage}\n{Stack}",
            kind,
            LogRedaction.PathOnly(report.Page, MaxPageLength) is { Length: > 0 } page ? page : "(unknown page)",
            message.Length > 0 ? message : "(no message)",
            LogRedaction.Redact(report.Stack, MaxStackLength));
        return true;
    }

    private bool TryTakeSlot()
    {
        if (_maxPerMinute <= 0)
        {
            return true;
        }

        var minute = _timeProvider.GetUtcNow().ToUnixTimeSeconds() / 60;
        lock (_gate)
        {
            if (minute != _minute)
            {
                _minute = minute;
                _countThisMinute = 0;
            }

            if (_countThisMinute >= _maxPerMinute)
            {
                return false;
            }

            _countThisMinute++;
            return true;
        }
    }
}
