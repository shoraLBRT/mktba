using MailKit;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;
using Mktba.Application.Configuration;

namespace Mktba.Application.Services.Email;

/// <summary>
/// Sends through the mail server of <c>Email:Smtp</c> (MailKit), one connection per message: a few
/// notifications an hour do not need a pool. A refusal of the recipient or the message itself (a 5xx
/// answer to it) is permanent; anything else — the server away, a sign-in or TLS problem, a 4xx —
/// is worth another try.
/// </summary>
public sealed class SmtpEmailSender(IOptions<EmailOptions> options) : IEmailSender
{
    private readonly EmailOptions _options = options.Value;

    public async Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        var smtp = _options.Smtp;
        var mime = new MimeMessage();
        mime.From.Add(new MailboxAddress(string.IsNullOrWhiteSpace(smtp.FromName) ? _options.SiteName : smtp.FromName, smtp.FromAddress));
        try
        {
            mime.To.Add(new MailboxAddress(message.ToName ?? string.Empty, message.To));
        }
        catch (ParseException exception)
        {
            throw new EmailSendException("The recipient's address cannot be used.", permanent: true, exception);
        }

        mime.Subject = message.Subject;
        mime.Body = new TextPart("plain") { Text = message.TextBody };

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(Math.Max(1, smtp.TimeoutSeconds)));
        using var client = new SmtpClient { Timeout = Math.Max(1, smtp.TimeoutSeconds) * 1000 };
        try
        {
            var security = smtp.Security switch
            {
                SmtpSecurity.SslOnConnect => SecureSocketOptions.SslOnConnect,
                SmtpSecurity.None => SecureSocketOptions.None,
                _ => SecureSocketOptions.StartTls,
            };
            await client.ConnectAsync(smtp.Host, smtp.Port, security, timeout.Token);
            if (!string.IsNullOrEmpty(smtp.UserName))
            {
                await client.AuthenticateAsync(smtp.UserName, smtp.Password ?? string.Empty, timeout.Token);
            }

            await client.SendAsync(mime, timeout.Token);
            await client.DisconnectAsync(true, timeout.Token);
        }
        catch (SmtpCommandException exception) when (
            (int)exception.StatusCode >= 500
            && exception.ErrorCode is SmtpErrorCode.RecipientNotAccepted or SmtpErrorCode.MessageNotAccepted)
        {
            throw new EmailSendException($"The mail server refused the message: {(int)exception.StatusCode}.", permanent: true, exception);
        }
        catch (SmtpCommandException exception)
        {
            throw new EmailSendException($"The mail server answered {(int)exception.StatusCode} ({exception.ErrorCode}).", permanent: false, exception);
        }
        catch (AuthenticationException exception)
        {
            throw new EmailSendException("Signing in to the mail server failed.", permanent: false, exception);
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new EmailSendException("The mail server did not answer in time.", permanent: false, exception);
        }
        catch (Exception exception) when (exception is IOException or System.Net.Sockets.SocketException or SmtpProtocolException or SslHandshakeException or ServiceNotConnectedException or TimeoutException)
        {
            throw new EmailSendException($"The mail server could not be used: {exception.GetType().Name}.", permanent: false, exception);
        }
    }
}
