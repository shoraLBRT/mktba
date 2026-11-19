using System.Text;

namespace Mktba.Application.Configuration;

/// <summary>
/// Decides whether a configured JWT signing key (<c>Auth:JwtSigningKey</c>) is acceptable at startup.
/// </summary>
public static class JwtSigningKeyPolicy
{
    /// <summary>HS256 needs a key of at least 256 bits.</summary>
    public const int MinimumKeyBytes = 32;

    /// <summary>
    /// Placeholder keys that have been committed to the repository. They are public, so they are
    /// accepted only in Development.
    /// </summary>
    public static readonly IReadOnlyCollection<string> KnownPlaceholderKeys = new[]
    {
        "mktba_DevOnly_SigningKey_ChangeMe_1234567890",
        "<your_secure_signing_key_here>",
    };

    /// <summary>
    /// Returns why the key must not be used, or <c>null</c> when it is acceptable.
    /// A blank or too short key is rejected in every environment; a committed placeholder key
    /// is rejected everywhere except Development.
    /// </summary>
    public static string? Validate(string? signingKey, bool isDevelopment)
    {
        const string howToSet =
            "Set it with the environment variable Auth__JwtSigningKey (in Development also dotnet user-secrets), "
            + "for example a value from: openssl rand -base64 48";

        if (string.IsNullOrWhiteSpace(signingKey))
        {
            return $"Auth:JwtSigningKey is required. {howToSet}";
        }

        if (Encoding.UTF8.GetByteCount(signingKey) < MinimumKeyBytes)
        {
            return $"Auth:JwtSigningKey must be at least {MinimumKeyBytes} bytes (256 bits) for HS256. {howToSet}";
        }

        if (!isDevelopment && KnownPlaceholderKeys.Contains(signingKey, StringComparer.Ordinal))
        {
            return $"Auth:JwtSigningKey is a placeholder committed to the repository and is allowed only in Development. {howToSet}";
        }

        return null;
    }
}
