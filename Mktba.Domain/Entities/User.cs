namespace Mktba.Domain.Entities;

public enum UserRole
{
    Admin
}

public class User
{
    public int Id { get; set; }

    public string Email { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public UserRole Role { get; set; } = UserRole.Admin;

    /// <summary>Зарезервировано для будущей связки с внешним Identity-сервисом</summary>
    public string? ExternalId { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
