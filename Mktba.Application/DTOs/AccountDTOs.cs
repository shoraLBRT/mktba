namespace Mktba.Application.DTOs;

/// <summary>A reader's sign-up (U-05, #126). Sign-up only ever creates readers.</summary>
public class ReaderSignUpRequestDto
{
    public string Email { get; set; } = string.Empty;

    public string Password { get; set; } = string.Empty;

    /// <summary>Optional profile name; the same rules as on the profile page.</summary>
    public string? DisplayName { get; set; }

    /// <summary>Trap for bots: a person never fills it in (the form hides it). Anything but white space and nothing is stored.</summary>
    public string? Website { get; set; }
}

/// <summary>The token from the link of a confirmation email.</summary>
public class ConfirmEmailRequestDto
{
    public string Token { get; set; } = string.Empty;
}

/// <summary>Asks for a password reset email to <see cref="Email"/>.</summary>
public class PasswordResetRequestDto
{
    public string Email { get; set; } = string.Empty;

    /// <summary>Trap for bots, as on sign-up.</summary>
    public string? Website { get; set; }
}

/// <summary>The token from the link of a reset email and the new password.</summary>
public class PasswordResetConfirmDto
{
    public string Token { get; set; } = string.Empty;

    public string Password { get; set; } = string.Empty;
}
