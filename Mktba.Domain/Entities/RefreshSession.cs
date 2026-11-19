namespace Mktba.Domain.Entities;

/// <summary>
/// One refresh token of a signed-in device (U-03, #31). Every refresh rotates the token: the row is
/// revoked, points at its replacement, and a new row of the same <see cref="FamilyId"/> takes over.
/// The family is the device session; access tokens name it, so revoking the family ends the session
/// at once. Only the SHA-256 hash of the token is stored.
/// </summary>
public class RefreshSession
{
    public int Id { get; set; }

    /// <summary>The device session this token belongs to; shared by every token rotated from the first one.</summary>
    public Guid FamilyId { get; set; }

    public int UserId { get; set; }

    public User User { get; set; } = null!;

    /// <summary>Hex SHA-256 of the raw token; the raw token lives only in the client's cookie.</summary>
    public string TokenHash { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; }

    public DateTime ExpiresAtUtc { get; set; }

    /// <summary>When this token was last exchanged; null while it has not been used.</summary>
    public DateTime? LastUsedAtUtc { get; set; }

    /// <summary>When this token stopped being valid: rotated, signed out or revoked.</summary>
    public DateTime? RevokedAtUtc { get; set; }

    /// <summary>The token this one was rotated into; set only by a refresh, so a later use of this token is a reuse.</summary>
    public int? ReplacedById { get; set; }

    public RefreshSession? ReplacedBy { get; set; }

    /// <summary>The browser's User-Agent when the token was issued, for the session list.</summary>
    public string? UserAgent { get; set; }

    /// <summary>The client IP when the token was issued, for the session list.</summary>
    public string? IpAddress { get; set; }

    public bool IsActiveAt(DateTime nowUtc) => RevokedAtUtc is null && ExpiresAtUtc > nowUtc;
}
