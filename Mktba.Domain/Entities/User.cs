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
}
