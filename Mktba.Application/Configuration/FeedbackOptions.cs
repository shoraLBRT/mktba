namespace Mktba.Application.Configuration;

/// <summary>The <c>Feedback</c> configuration section (F-02, #67).</summary>
public sealed class FeedbackOptions
{
    public const string SectionName = "Feedback";

    public FeedbackGitHubOptions GitHub { get; set; } = new();

    public FeedbackDeliveryOptions Delivery { get; set; } = new();
}

/// <summary>
/// The GitHub App that files the issues, and the repository they go to. The app needs the
/// permissions Issues: write and Metadata: read and must be installed on that repository; the
/// installation is looked up at run time.
/// </summary>
public sealed class FeedbackGitHubOptions
{
    /// <summary>
    /// False switches delivery off whatever else is set: for test runs on a machine whose local
    /// settings hold a real key (the e2e API sets it).
    /// </summary>
    public bool Enabled { get; set; } = true;

    /// <summary>The App ID (or its client ID): the issuer of the app's JWT.</summary>
    public string? AppId { get; set; }

    /// <summary>Path to the app's private key (a PEM file) outside the repository.</summary>
    public string? PrivateKeyPath { get; set; }

    /// <summary>
    /// The private key itself as PEM text, for deployments that pass secrets through environment
    /// variables; line breaks may be written as <c>\n</c>. Wins over <see cref="PrivateKeyPath"/>.
    /// </summary>
    public string? PrivateKey { get; set; }

    /// <summary>Owner (user or organisation) of the repository the issues are created in.</summary>
    public string? Owner { get; set; }

    /// <summary>Name of that repository.</summary>
    public string? Repository { get; set; }

    public string ApiBaseUrl { get; set; } = "https://api.github.com";

    /// <summary>
    /// Whether delivery can be attempted at all. While it is false, feedback is still accepted and
    /// stored and simply stays <c>Pending</c>.
    /// </summary>
    public bool IsConfigured =>
        Enabled
        && !string.IsNullOrWhiteSpace(AppId)
        && !string.IsNullOrWhiteSpace(Owner)
        && !string.IsNullOrWhiteSpace(Repository)
        && (!string.IsNullOrWhiteSpace(PrivateKey) || !string.IsNullOrWhiteSpace(PrivateKeyPath));
}

/// <summary>How the background worker walks the queue.</summary>
public sealed class FeedbackDeliveryOptions
{
    /// <summary>Pause between looks at the queue.</summary>
    public int PollIntervalSeconds { get; set; } = 30;

    /// <summary>Most messages taken in one look.</summary>
    public int BatchSize { get; set; } = 20;

    /// <summary>Delay before the second attempt; it doubles with every further one.</summary>
    public int RetryBaseSeconds { get; set; } = 60;

    /// <summary>The longest delay between attempts, for a message and for the worker's own pause while GitHub is unavailable.</summary>
    public int RetryMaxSeconds { get; set; } = 3600;

    /// <summary>The delay before the next attempt after <paramref name="failures"/> failed ones in a row (1 or more).</summary>
    public TimeSpan RetryDelay(int failures)
    {
        var baseSeconds = Math.Max(1, RetryBaseSeconds);
        var maxSeconds = Math.Max(baseSeconds, RetryMaxSeconds);
        var doublings = Math.Clamp(failures - 1, 0, 30);
        return TimeSpan.FromSeconds(Math.Min(maxSeconds, baseSeconds * Math.Pow(2, doublings)));
    }
}
