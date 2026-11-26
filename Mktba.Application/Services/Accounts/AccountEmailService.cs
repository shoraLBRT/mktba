using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.Services.Email;
using Mktba.Application.Services.Notifications;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Application.Services.Accounts;

/// <summary>
/// Sends the account emails waiting in the outbox (U-05, #126) the way
/// <see cref="NotificationEmailService"/> sends notifications: <see cref="AccountEmail.Attempts"/> is
/// a concurrency token incremented and saved before the server is called, a temporary failure leaves
/// the email pending with a doubling delay and ends the run, a refusal or the last attempt makes it
/// <c>Failed</c>. They are sent whatever the user's notification settings say.
/// </summary>
/// <remarks>
/// The token of a confirmation or a reset is made in the same save as the attempt, so the raw token
/// exists only in memory and in the email; an attempt that failed leaves an unused token that expires.
/// Logs name the email's id and purpose, never the address, the text or the token.
/// </remarks>
public sealed class AccountEmailService
{
    private readonly MktbaDbContext _db;
    private readonly IEmailSender _sender;
    private readonly EmailOptions _options;
    private readonly AuthOptions _auth;
    private readonly TimeProvider _clock;
    private readonly ILogger<AccountEmailService> _logger;

    public AccountEmailService(
        MktbaDbContext db,
        IEmailSender sender,
        IOptions<EmailOptions> options,
        IOptions<AuthOptions> auth,
        TimeProvider clock,
        ILogger<AccountEmailService> logger)
    {
        _db = db;
        _sender = sender;
        _options = options.Value;
        _auth = auth.Value;
        _clock = clock;
        _logger = logger;
    }

    /// <summary>Tries every pending email whose time has come, the longest-waiting first, up to the batch size.</summary>
    public async Task<NotificationEmailRun> SendDueAsync(CancellationToken cancellationToken = default)
    {
        var now = _clock.GetUtcNow().UtcDateTime;
        var dueIds = await _db.AccountEmails.AsNoTracking()
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

    /// <summary>How long the link of <paramref name="purpose"/> works.</summary>
    public TimeSpan LifetimeOf(AccountEmailPurpose purpose) => purpose == AccountEmailPurpose.PasswordReset
        ? TimeSpan.FromMinutes(Math.Max(1, _auth.PasswordResetTokenLifetimeMinutes))
        : TimeSpan.FromHours(Math.Max(1, _auth.EmailConfirmationTokenLifetimeHours));

    private async Task<Outcome> SendAsync(int id, CancellationToken cancellationToken)
    {
        var email = await _db.AccountEmails.Include(candidate => candidate.User)
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);
        if (email is null || email.State != EmailDeliveryState.Pending)
        {
            return Outcome.Skipped;
        }

        var now = _clock.GetUtcNow().UtcDateTime;
        email.Attempts++;
        email.LastAttemptAt = now;
        email.NextAttemptAt = now + _options.Delivery.RetryDelay(email.Attempts);
        var lifetime = LifetimeOf(email.Purpose);
        string? rawToken = null;
        if (email.Purpose != AccountEmailPurpose.SignUpAttempt)
        {
            await RemoveExpiredTokensAsync(email.UserId, now, cancellationToken);
            var (raw, token) = ReaderAccountService.NewToken(email.UserId, email.Purpose, now, lifetime);
            _db.AccountTokens.Add(token);
            rawToken = raw;
        }

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Outcome.Skipped;
        }

        var recipient = email.User;
        var outcome = Outcome.Sent;
        try
        {
            await _sender.SendAsync(
                new EmailMessage(
                    recipient.Email,
                    recipient.DisplayName,
                    AccountEmailFormatter.Subject(email.Purpose, _options),
                    AccountEmailFormatter.Body(email.Purpose, recipient.DisplayName, rawToken, lifetime, _options)),
                cancellationToken);
            email.State = EmailDeliveryState.Sent;
            email.SentAt = _clock.GetUtcNow().UtcDateTime;
            email.LastError = null;
        }
        catch (EmailSendException exception)
        {
            email.LastError = exception.Message.Length > AccountEmail.LastErrorMaxLength
                ? exception.Message[..AccountEmail.LastErrorMaxLength]
                : exception.Message;
            outcome = exception.Permanent ? Outcome.Failed : Outcome.ServerUnavailable;
            if (exception.Permanent || email.Attempts >= Math.Max(1, _options.Delivery.MaxAttempts))
            {
                email.State = EmailDeliveryState.Failed;
                _logger.LogError(
                    "Account email {EmailId} ({Purpose}) was given up after attempt {Attempt}: {Error}",
                    email.Id, email.Purpose, email.Attempts, exception.Message);
            }
            else
            {
                _logger.LogWarning(
                    "Account email {EmailId} ({Purpose}) was not sent (attempt {Attempt}), next try at {NextAttemptAt:o}: {Error}",
                    email.Id, email.Purpose, email.Attempts, email.NextAttemptAt, exception.Message);
            }
        }

        // Not cancellable: once the server has answered, the answer must reach the row.
        await _db.SaveChangesAsync(CancellationToken.None);
        return outcome;
    }

    private async Task RemoveExpiredTokensAsync(int userId, DateTime now, CancellationToken cancellationToken)
        => _db.AccountTokens.RemoveRange(await _db.AccountTokens
            .Where(token => token.UserId == userId && token.ExpiresAtUtc <= now)
            .ToListAsync(cancellationToken));

    private enum Outcome
    {
        Sent,
        Skipped,
        Failed,
        ServerUnavailable,
    }
}
