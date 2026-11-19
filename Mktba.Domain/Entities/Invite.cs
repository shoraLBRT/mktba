namespace Mktba.Domain.Entities;

/// <summary>
/// An invitation to register with a given role (U-04, #32). Only the SHA-256 hash of the random
/// token is stored; the raw token is shown once, to the admin who creates the invite. An invite is
/// single-use: registering with it sets <see cref="UsedAtUtc"/>, and that update only succeeds while
/// the invite is still unused and not revoked (both are concurrency tokens), so two registrations
/// racing for one invite cannot both succeed.
/// </summary>
public class Invite
{
    public const int NoteMaxLength = 200;

    public int Id { get; set; }

    public string TokenHash { get; set; } = string.Empty;

    /// <summary>The role the invited user gets on registration.</summary>
    public UserRole Role { get; set; }

    /// <summary>Optional label for the admin (who the invite is for); never sent anywhere.</summary>
    public string? Note { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public DateTime ExpiresAtUtc { get; set; }

    public DateTime? UsedAtUtc { get; set; }

    public DateTime? RevokedAtUtc { get; set; }

    public int CreatedByUserId { get; set; }

    public User CreatedByUser { get; set; } = null!;

    public int? UsedByUserId { get; set; }

    public User? UsedByUser { get; set; }

    /// <summary>Where the invite stands at <paramref name="nowUtc"/>; used and revoked win over expired.</summary>
    public InviteStatus StatusAt(DateTime nowUtc)
        => UsedAtUtc.HasValue ? InviteStatus.Used
            : RevokedAtUtc.HasValue ? InviteStatus.Revoked
            : ExpiresAtUtc <= nowUtc ? InviteStatus.Expired
            : InviteStatus.Active;
}

public enum InviteStatus
{
    /// <summary>Can still be used to register.</summary>
    Active,

    /// <summary>Someone registered with it.</summary>
    Used,

    /// <summary>An admin withdrew it before it was used.</summary>
    Revoked,

    /// <summary>Its lifetime ended before it was used.</summary>
    Expired,
}
