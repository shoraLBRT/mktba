using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs;

public class AdminAuthStatusDto
{
    public bool RequiresBootstrapAdmin { get; set; }
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

public class AdminAuthResponseDto
{
    public string AccessToken { get; set; } = string.Empty;

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
}
public class AdminInviteTokenCreateResponseDto
{
    public string Token { get; set; } = string.Empty;

    public DateTime ExpiresAtUtc { get; set; }
}
