using Mktba.Application.Exceptions;

namespace Mktba.Application.Services;

/// <summary>
/// What a new password must be (U-06, #134), after NIST SP 800-63B: a length range and nothing about
/// character classes. Length counts Unicode code points, so every letter of any script, a space or an
/// emoji is one character. The password is taken as typed: no trimming, no normalization. The rules apply
/// only when a password is set (registration); signing in checks the stored hash and nothing else, so
/// older, shorter passwords keep working. Client mirror: <c>mktba.react/src/shared/password.ts</c>.
/// </summary>
public static class PasswordRules
{
    /// <summary>Fewest characters a new password has.</summary>
    public const int MinLength = 12;

    /// <summary>Most characters a new password has: long enough for any passphrase, short enough to hash cheaply.</summary>
    public const int MaxLength = 128;

    /// <summary>
    /// The first rule <paramref name="password"/> breaks for an account with <paramref name="email"/>, or null
    /// when it is acceptable. Besides the length, a password may not be the email or its part before
    /// <c>@</c> (ignoring case), nor one character repeated.
    /// </summary>
    public static AppError? Check(string password, string? email)
    {
        var length = password.EnumerateRunes().Count();
        if (length < MinLength) return AppErrors.PasswordTooShort(MinLength);
        if (length > MaxLength) return AppErrors.PasswordTooLong(MaxLength);
        return IsTooSimple(password, email) ? AppErrors.PasswordTooSimple : null;
    }

    private static bool IsTooSimple(string password, string? email)
    {
        var first = password.EnumerateRunes().First();
        if (password.EnumerateRunes().All(rune => rune == first)) return true;

        var normalizedEmail = email?.Trim();
        if (string.IsNullOrEmpty(normalizedEmail)) return false;
        if (string.Equals(password, normalizedEmail, StringComparison.OrdinalIgnoreCase)) return true;

        var at = normalizedEmail.IndexOf('@');
        return at > 0 && string.Equals(password, normalizedEmail[..at], StringComparison.OrdinalIgnoreCase);
    }
}
