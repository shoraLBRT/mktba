namespace Mktba.Application.Configuration;

public sealed class AuthOptions
{
    public const string SectionName = "Auth";

    public string JwtIssuer { get; set; } = "Mktba";

    public string JwtAudience { get; set; } = "Mktba.Admin";

    public string JwtSigningKey { get; set; } = string.Empty;

    /// <summary>Lifetime of an access token; the client renews it through <c>POST /auth/refresh</c>.</summary>
    public int AccessTokenLifetimeMinutes { get; set; } = 15;

    /// <summary>
    /// Lifetime of a refresh token (U-03). Sliding: every refresh issues a new token with the full
    /// lifetime, so a device stays signed in while it is used at least this often.
    /// </summary>
    public int RefreshTokenLifetimeDays { get; set; } = 30;

    /// <summary>
    /// Path of the refresh-token cookie: where the browser sends it. It must cover the API's
    /// <c>/auth</c> endpoints as the browser sees them (for example <c>/api/auth</c> behind a reverse proxy).
    /// </summary>
    public string RefreshCookiePath { get; set; } = "/auth";

    public int InviteTokenLifetimeHours { get; set; } = 24;

    /// <summary>
    /// Whether anyone may open a reader account (<c>POST /auth/sign-up</c>, U-05 #126). Sign-up only
    /// ever creates readers; authors still come by an admin's invite (D3, #19).
    /// </summary>
    public bool ReaderSignUpEnabled { get; set; } = true;

    /// <summary>How long the link of an address confirmation works.</summary>
    public int EmailConfirmationTokenLifetimeHours { get; set; } = 48;

    /// <summary>How long the link of a password reset works.</summary>
    public int PasswordResetTokenLifetimeMinutes { get; set; } = 60;

    /// <summary>
    /// Most account emails of one purpose an account gets in any 60 minutes; further requests are
    /// answered as usual and send nothing, so nobody can flood a mailbox through the forms.
    /// </summary>
    public int AccountEmailsPerHour { get; set; } = 3;
}
