using Microsoft.Extensions.Logging;

namespace Mktba.Application.Services.Email;

/// <summary>
/// The sender while no mail server is configured (local runs, the e2e API, a stand without SMTP):
/// writes one line per email to the log — the subject only, never the address or the text — and
/// counts it as sent, so the outbox does not pile up mail for a server that may never come.
/// </summary>
public sealed class LogEmailSender(ILogger<LogEmailSender> logger) : IEmailSender
{
    public Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        logger.LogInformation("Email not sent, no mail server is configured (Email:Smtp, Email:SiteUrl): {Subject}", message.Subject);
        return Task.CompletedTask;
    }
}
