namespace Mktba.Application.Services.Email;

/// <summary>One plain-text email to one address.</summary>
public sealed record EmailMessage(string To, string? ToName, string Subject, string TextBody);

/// <summary>
/// Sends email (V-09, #125). <see cref="SmtpEmailSender"/> when <c>Email:Smtp</c> and
/// <c>Email:SiteUrl</c> are configured, else <see cref="LogEmailSender"/>; tests put a fake in its place.
/// </summary>
public interface IEmailSender
{
    /// <summary>Hands the message over.</summary>
    /// <exception cref="EmailSendException">The server could not be used, or it refused the message.</exception>
    Task SendAsync(EmailMessage message, CancellationToken cancellationToken);
}

/// <summary>A send that did not go through.</summary>
/// <param name="permanent">The server refused this message for good (e.g. an unknown mailbox); retrying will not help.</param>
public sealed class EmailSendException(string message, bool permanent, Exception? inner = null) : Exception(message, inner)
{
    public bool Permanent { get; } = permanent;
}
