using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.Services.Email;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Application.Services.Notifications;

/// <summary>
/// Sends the notification emails waiting in the outbox (V-09, #125), as the feedback delivery does
/// with its queue (F-02, #67): the <see cref="NotificationEmail"/> rows survive a restart.
/// </summary>
/// <remarks>
/// One attempt: <see cref="NotificationEmail.Attempts"/> is incremented and the next attempt
/// scheduled and saved <em>before</em> the server is called (the counter is a concurrency token, so a
/// second worker loses the row). A temporary failure leaves the email pending with a doubling delay
/// and ends the run — the others would fail the same way —, up to
/// <see cref="EmailDeliveryOptions.MaxAttempts"/>; a refusal of the message is final. The address is
/// the recipient's current one. Logs name the email's id, never its address or text.
/// </remarks>
public sealed class NotificationEmailService
{
    private readonly MktbaDbContext _db;
    private readonly IEmailSender _sender;
    private readonly EmailOptions _options;
    private readonly TimeProvider _clock;
    private readonly ILogger<NotificationEmailService> _logger;

    public NotificationEmailService(
        MktbaDbContext db, IEmailSender sender, IOptions<EmailOptions> options, TimeProvider clock, ILogger<NotificationEmailService> logger)
    {
        _db = db;
        _sender = sender;
        _options = options.Value;
        _clock = clock;
        _logger = logger;
    }

    /// <summary>Tries every pending email whose time has come, the longest-waiting first, up to the batch size.</summary>
    public async Task<NotificationEmailRun> SendDueAsync(CancellationToken cancellationToken = default)
    {
        var now = _clock.GetUtcNow().UtcDateTime;
        var dueIds = await _db.NotificationEmails.AsNoTracking()
            .Where(email => email.State == EmailDeliveryState.Pending && email.NextAttemptAt <= now)
            .OrderBy(email => email.NextAttemptAt).ThenBy(email => email.Id)
            .Select(email => email.Id)
            .Take(Math.Max(1, _options.Delivery.BatchSize))
            .ToListAsync(cancellationToken);
        var sent = 0;
        foreach (var id in dueIds)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var outcome = await SendAsync(id, cancellationToken);
            _db.ChangeTracker.Clear();
            if (outcome == Outcome.Sent)
            {
                sent++;
            }
            else if (outcome == Outcome.ServerUnavailable)
            {
                return new NotificationEmailRun(sent, true);
            }
        }

        return new NotificationEmailRun(sent, false);
    }

    private async Task<Outcome> SendAsync(int id, CancellationToken cancellationToken)
    {
        var email = await _db.NotificationEmails
            .Include(candidate => candidate.Notification).ThenInclude(notification => notification.User)
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);
        if (email is null || email.State != EmailDeliveryState.Pending)
        {
            return Outcome.Skipped;
        }

        var now = _clock.GetUtcNow().UtcDateTime;
        email.Attempts++;
        email.LastAttemptAt = now;
        email.NextAttemptAt = now + _options.Delivery.RetryDelay(email.Attempts);
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Outcome.Skipped;
        }

        var notification = email.Notification;
        var recipient = notification.User;
        var outcome = Outcome.Sent;
        try
        {
            await _sender.SendAsync(
                new EmailMessage(
                    recipient.Email,
                    recipient.DisplayName,
                    NotificationEmailFormatter.Subject(notification, _options),
                    NotificationEmailFormatter.Body(notification, recipient.DisplayName, _options)),
                cancellationToken);
            email.State = EmailDeliveryState.Sent;
            email.SentAt = _clock.GetUtcNow().UtcDateTime;
            email.LastError = null;
        }
        catch (EmailSendException exception)
        {
            email.LastError = exception.Message.Length > NotificationEmail.LastErrorMaxLength
                ? exception.Message[..NotificationEmail.LastErrorMaxLength]
                : exception.Message;
            // A temporary failure ends the run even on the last attempt: the server is away for the others too.
            outcome = exception.Permanent ? Outcome.Failed : Outcome.ServerUnavailable;
            if (exception.Permanent || email.Attempts >= Math.Max(1, _options.Delivery.MaxAttempts))
            {
                email.State = EmailDeliveryState.Failed;
                _logger.LogError("Notification email {EmailId} was given up after attempt {Attempt}: {Error}", email.Id, email.Attempts, exception.Message);
            }
            else
            {
                _logger.LogWarning(
                    "Notification email {EmailId} was not sent (attempt {Attempt}), next try at {NextAttemptAt:o}: {Error}",
                    email.Id, email.Attempts, email.NextAttemptAt, exception.Message);
            }
        }

        // Not cancellable: once the server has answered, the answer must reach the row.
        await _db.SaveChangesAsync(CancellationToken.None);
        return outcome;
    }

    private enum Outcome
    {
        Sent,
        Skipped,
        Failed,
        ServerUnavailable,
    }
}

/// <param name="Sent">Emails handed over in this run.</param>
/// <param name="ServerUnavailable">The run stopped early because the mail server could not be used.</param>
public sealed record NotificationEmailRun(int Sent, bool ServerUnavailable);
