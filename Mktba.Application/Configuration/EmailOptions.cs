namespace Mktba.Application.Configuration;

/// <summary>
/// The <c>Email</c> configuration section (V-09, #125): the mail server notifications are sent
/// through and how the outbox is walked. Without a configured server every email is written to the
/// log instead (<c>LogEmailSender</c>): nothing leaves the machine.
/// </summary>
public sealed class EmailOptions
{
    public const string SectionName = "Email";

    /// <summary>
    /// The site's public address the links in an email start with, for example <c>https://mktba.ru</c>.
    /// Required for sending through the mail server: an email without working links is not sent.
    /// </summary>
    public string? SiteUrl { get; set; }

    /// <summary>The site's name in the subject and the signature.</summary>
    public string SiteName { get; set; } = "mktba";

    public SmtpOptions Smtp { get; set; } = new();

    public EmailDeliveryOptions Delivery { get; set; } = new();

    /// <summary><see cref="SiteUrl"/> as an absolute http(s) address without a trailing slash, else null.</summary>
    public string? SiteBaseUrl =>
        Uri.TryCreate(SiteUrl?.Trim(), UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp)
            ? uri.GetLeftPart(UriPartial.Path).TrimEnd('/')
            : null;

    /// <summary>Whether emails go to the mail server; otherwise they are only written to the log.</summary>
    public bool SendsThroughSmtp => Smtp.IsConfigured && SiteBaseUrl is not null;
}

/// <summary>How the connection to the mail server is secured.</summary>
public enum SmtpSecurity
{
    /// <summary>Plain connection upgraded with STARTTLS, which must be offered (port 587).</summary>
    StartTls = 1,

    /// <summary>TLS from the first byte (port 465).</summary>
    SslOnConnect = 2,

    /// <summary>No TLS at all: only for a local test server.</summary>
    None = 3,
}

/// <summary>
/// The mail server. The account's password belongs in user secrets or an environment variable
/// (<c>Email__Smtp__Password</c>), never in a committed file.
/// </summary>
public sealed class SmtpOptions
{
    /// <summary>False switches sending off whatever else is set (the e2e API sets it).</summary>
    public bool Enabled { get; set; } = true;

    public string? Host { get; set; }

    public int Port { get; set; } = 587;

    public SmtpSecurity Security { get; set; } = SmtpSecurity.StartTls;

    /// <summary>The account to sign in with; empty for a server that takes mail without signing in.</summary>
    public string? UserName { get; set; }

    public string? Password { get; set; }

    /// <summary>The sender's address, for example <c>notify@mktba.ru</c> (its domain needs SPF and DKIM).</summary>
    public string? FromAddress { get; set; }

    /// <summary>The sender's name shown by mail clients; the site's name when empty.</summary>
    public string? FromName { get; set; }

    /// <summary>Seconds one connection, sign-in and send may take.</summary>
    public int TimeoutSeconds { get; set; } = 30;

    public bool IsConfigured =>
        Enabled && !string.IsNullOrWhiteSpace(Host) && !string.IsNullOrWhiteSpace(FromAddress) && Port is > 0 and < 65536;
}

/// <summary>How the background worker walks the outbox.</summary>
public sealed class EmailDeliveryOptions
{
    /// <summary>Pause between looks at the outbox.</summary>
    public int PollIntervalSeconds { get; set; } = 30;

    /// <summary>Most emails taken in one look.</summary>
    public int BatchSize { get; set; } = 20;

    /// <summary>Delay before the second attempt; it doubles with every further one.</summary>
    public int RetryBaseSeconds { get; set; } = 60;

    /// <summary>The longest delay between attempts.</summary>
    public int RetryMaxSeconds { get; set; } = 3600;

    /// <summary>
    /// Attempts before an email is given up as <c>Failed</c>: a notification that could not be mailed
    /// for about half a day is still in the in-app list, and a late email helps no one.
    /// </summary>
    public int MaxAttempts { get; set; } = 10;

    /// <summary>The delay before the next attempt after <paramref name="failures"/> failed ones in a row (1 or more).</summary>
    public TimeSpan RetryDelay(int failures)
    {
        var baseSeconds = Math.Max(1, RetryBaseSeconds);
        var maxSeconds = Math.Max(baseSeconds, RetryMaxSeconds);
        var doublings = Math.Clamp(failures - 1, 0, 30);
        return TimeSpan.FromSeconds(Math.Min(maxSeconds, baseSeconds * Math.Pow(2, doublings)));
    }
}
