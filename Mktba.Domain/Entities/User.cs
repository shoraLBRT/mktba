namespace Mktba.Domain.Entities;

/// <summary>
/// What a user may do on the platform. Stored by name, so the order of the members is free.
/// The policies that grant each role its rights live in Mktba.Api (Policies).
/// </summary>
public enum UserRole
{
    /// <summary>Signed-in reader: no editorial rights.</summary>
    Reader,

    /// <summary>Writes articles (D3: invited by an admin).</summary>
    Author,

    /// <summary>Verifies articles (D5); has no editorial rights of its own.</summary>
    Scholar,

    /// <summary>Full access: content, review and publication (D4), users and settings.</summary>
    Admin,
}

public class User
{
    public int Id { get; set; }

    public string Email { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    /// <summary>Defaults to the least privileged role; whoever creates a user sets the role explicitly.</summary>
    public UserRole Role { get; set; } = UserRole.Reader;

    /// <summary>Зарезервировано для будущей связки с внешним Identity-сервисом</summary>
    public string? ExternalId { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// When the user proved the address is theirs (U-05, #126): by the confirmation link, or by a
    /// password reset sent to it. Null for a reader who signed up and has not confirmed yet; an
    /// invited user and the first admin are confirmed when they register (the invite stands in for it).
    /// </summary>
    public DateTime? EmailConfirmedAtUtc { get; set; }

    /// <summary>
    /// The name readers see (U-07, #72); null until the user fills in their profile. A user without
    /// one is shown nowhere in public: nothing ever falls back to the email.
    /// </summary>
    public string? DisplayName { get; set; }

    /// <summary>
    /// URL segment of the public profile (<c>/authors/{slug}</c>), unique; set exactly when
    /// <see cref="DisplayName"/> is. Follows the article slug rules. A changed slug is not kept.
    /// </summary>
    public string? Slug { get; set; }

    /// <summary>Avatar address: an absolute http(s) URL or a site-relative path. There is no upload (U-08, #73).</summary>
    public string? AvatarUrl { get; set; }

    /// <summary>A few words about the user: plain text, line breaks allowed, no markup.</summary>
    public string? Bio { get; set; }

    /// <summary>Academic degree as the user states it. Self-declared: confirming it is the verification epic's job (V-01, #117).</summary>
    public string? Degree { get; set; }

    /// <summary>Where the user studied or works, as they state it. Self-declared, like <see cref="Degree"/>.</summary>
    public string? Institution { get; set; }

    /// <summary>Labelled links to the user's pages elsewhere, in <see cref="UserLink.Order"/>.</summary>
    public List<UserLink> Links { get; set; } = new();
}
