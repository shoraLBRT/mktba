namespace Mktba.Application.Configuration;

/// <summary>
/// The <c>ClientErrors</c> configuration section (X-05, #159): browser error reports taken in by
/// <c>POST /client-errors</c>. The per-client limit is <c>RateLimiting:ClientErrors</c>.
/// </summary>
public sealed class ClientErrorOptions
{
    public const string SectionName = "ClientErrors";

    /// <summary>
    /// Most reports logged in any minute from all visitors together, so a broken release seen by many
    /// readers cannot flood the log; further ones are accepted and dropped. Zero or less: no cap.
    /// </summary>
    public int MaxPerMinute { get; set; } = 60;
}

/// <summary>
/// The <c>Alerts</c> configuration section (X-05, #159): log entries at <see cref="MinimumLevel"/> or
/// above are sent to the owner's Telegram chat. Off while the bot token or the chat id is empty.
/// </summary>
public sealed class AlertOptions
{
    public const string SectionName = "Alerts";

    /// <summary>Names the stand in the message (for example <c>production</c>); empty: the hosting environment.</summary>
    public string? Stand { get; set; }

    /// <summary>The lowest level sent: <c>Error</c> by default, <c>Critical</c> for less.</summary>
    public string MinimumLevel { get; set; } = "Error";

    /// <summary>The same kind of entry (category, message template, exception type) is sent at most once per this many minutes; repeats are counted into the next one.</summary>
    public int ThrottleMinutes { get; set; } = 30;

    /// <summary>Most messages sent in any 60 minutes; beyond that entries are dropped. Zero or less: no cap.</summary>
    public int MaxPerHour { get; set; } = 20;

    public TelegramAlertOptions Telegram { get; set; } = new();
}

/// <summary>A Telegram bot the owner created (@BotFather) and the chat it writes to.</summary>
public sealed class TelegramAlertOptions
{
    /// <summary>The bot's token: a secret, set through the environment (<c>Alerts__Telegram__BotToken</c>), never committed.</summary>
    public string? BotToken { get; set; }

    /// <summary>The chat (a user, group or channel id) the bot posts to; the bot must be allowed to write there.</summary>
    public string? ChatId { get; set; }

    public string ApiBaseUrl { get; set; } = "https://api.telegram.org";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(BotToken) && !string.IsNullOrWhiteSpace(ChatId);
}
