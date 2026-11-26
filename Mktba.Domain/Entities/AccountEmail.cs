namespace Mktba.Domain.Entities;

/// <summary>What an account email (U-05, #126) is for. Stored by name, so the order of the members is free.</summary>
public enum AccountEmailPurpose
{
    /// <summary>The link that confirms the address of a reader who signed up.</summary>
    EmailConfirmation = 1,

    /// <summary>The link that sets a new password.</summary>
    PasswordReset = 2,

    /// <summary>
    /// Someone tried to sign up with an address that already has an account. The sign-up answers as
    /// for a new address (no enumeration); the owner of the address is told instead, with no link
    /// that does anything.
    /// </summary>
    SignUpAttempt = 3,
}

/// <summary>
/// One transactional email of an account (U-05, #126) waiting in the outbox, sent by the same worker
/// and with the same retries as the notification emails (V-09, #125). It is sent whatever the user's
/// notification settings say. The row holds no link and no token: the token of a confirmation or a
/// reset is made when the email is sent, so a raw token never rests in the database.
/// </summary>
public class AccountEmail
{
    /// <summary>The longest error kept (the server's status and message; never the email's text).</summary>
    public const int LastErrorMaxLength = 500;

    public int Id { get; set; }

    public int UserId { get; set; }

    public User User { get; set; } = null!;

    public AccountEmailPurpose Purpose { get; set; }

    /// <summary>When it was asked for; the per-account cap counts these.</summary>
    public DateTime CreatedAtUtc { get; set; }

    public EmailDeliveryState State { get; set; } = EmailDeliveryState.Pending;

    public int Attempts { get; set; }

    public DateTime NextAttemptAt { get; set; }

    public DateTime? LastAttemptAt { get; set; }

    public DateTime? SentAt { get; set; }

    public string? LastError { get; set; }
}

/// <summary>
/// A single-use token of an account email (U-05, #126): the SHA-256 hash of a random 256-bit value
/// whose raw form exists only in the email's link. Using one deletes every token of the same user and
/// purpose, so an older link stops working too.
/// </summary>
public class AccountToken
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public User User { get; set; } = null!;

    /// <summary><see cref="AccountEmailPurpose.EmailConfirmation"/> or <see cref="AccountEmailPurpose.PasswordReset"/>.</summary>
    public AccountEmailPurpose Purpose { get; set; }

    public string TokenHash { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; }

    public DateTime ExpiresAtUtc { get; set; }
}
