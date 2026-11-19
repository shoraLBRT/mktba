using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs;

/// <summary>A new invite (U-04, #32). Admin only.</summary>
public class InviteCreateRequestDto
{
    /// <summary>The role the invited user gets on registration.</summary>
    public UserRole Role { get; set; }

    /// <summary>How long the invite stays valid, in hours (1 to 720); null uses <c>Auth:InviteTokenLifetimeHours</c>.</summary>
    public int? LifetimeHours { get; set; }

    /// <summary>Optional label for admins (who the invite is for), at most 200 characters. Nothing is sent to anyone.</summary>
    public string? Note { get; set; }
}

/// <summary>A created invite. <see cref="Token"/> is shown only here: the server keeps only its hash.</summary>
public class InviteCreatedDto
{
    public int Id { get; set; }

    public string Token { get; set; } = string.Empty;

    public UserRole Role { get; set; }

    public DateTime ExpiresAtUtc { get; set; }
}

/// <summary>An invite as the admin list shows it; never carries the token.</summary>
public class InviteDto
{
    public int Id { get; set; }

    public UserRole Role { get; set; }

    public string? Note { get; set; }

    public InviteStatus Status { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public DateTime ExpiresAtUtc { get; set; }

    public DateTime? UsedAtUtc { get; set; }

    public DateTime? RevokedAtUtc { get; set; }

    public string CreatedByEmail { get; set; } = string.Empty;

    /// <summary>Who registered with the invite; null while it is unused.</summary>
    public string? UsedByEmail { get; set; }
}
