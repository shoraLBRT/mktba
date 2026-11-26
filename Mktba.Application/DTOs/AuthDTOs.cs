using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs;

public class AdminAuthStatusDto
{
    public bool RequiresBootstrapAdmin { get; set; }

    /// <summary>Whether readers may open an account themselves (<c>POST /auth/sign-up</c>, U-05 #126).</summary>
    public bool ReaderSignUpEnabled { get; set; }
}

public class AdminRegisterRequestDto
{
    public string Email { get; set; } = string.Empty;

    public string Password { get; set; } = string.Empty;

    public string? InviteToken { get; set; }
}

public class AdminLoginRequestDto
{
    public string Email { get; set; } = string.Empty;

    public string Password { get; set; } = string.Empty;
}

/// <summary>
/// Answer of login, register and refresh. The refresh token is not here: it travels only in the
/// <c>httpOnly</c> cookie the same response sets.
/// </summary>
public class AdminAuthResponseDto
{
    /// <summary>Short-lived bearer token; keep it in memory, not in storage.</summary>
    public string AccessToken { get; set; } = string.Empty;

    /// <summary>When <see cref="AccessToken"/> expires.</summary>
    public DateTime ExpiresAtUtc { get; set; }

    public string Email { get; set; } = string.Empty;

    /// <summary>The user's role when the token was issued; <c>GET /auth/me</c> gives the current one.</summary>
    public UserRole Role { get; set; }
}

/// <summary>The caller of <c>GET /auth/me</c>, read from the database on every request.</summary>
public class CurrentUserDto
{
    public int Id { get; set; }

    public string Email { get; set; } = string.Empty;

    public UserRole Role { get; set; }

    /// <summary>Whether the user confirmed their address (U-05, #126); a reader who signed up starts without.</summary>
    public bool EmailConfirmed { get; set; }
}
/// <summary>One signed-in device of the caller, as listed by <c>GET /auth/sessions</c>.</summary>
public class SessionDto
{
    /// <summary>The device session; <c>DELETE /auth/sessions/{id}</c> ends it.</summary>
    public Guid Id { get; set; }

    /// <summary>When the device signed in.</summary>
    public DateTime StartedAtUtc { get; set; }

    /// <summary>When the device last signed in or renewed its access token.</summary>
    public DateTime LastActiveAtUtc { get; set; }

    /// <summary>When the session ends unless the device renews it before then.</summary>
    public DateTime ExpiresAtUtc { get; set; }

    public string? UserAgent { get; set; }

    public string? IpAddress { get; set; }

    /// <summary>Whether this is the session of the request's own access token.</summary>
    public bool IsCurrent { get; set; }
}
