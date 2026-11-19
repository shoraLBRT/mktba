namespace Mktba.Domain.Entities;

/// <summary>
/// The content languages the platform supports, as short lowercase codes. This list is the one
/// place a new language is added (D6, #21): each translation of an article is its own article
/// with its own <see cref="Article.Locale"/>.
/// </summary>
public static class Locales
{
    /// <summary>Russian, the language of every article written before translations exist.</summary>
    public const string Default = "ru";

    /// <summary>Longest locale code the database stores.</summary>
    public const int MaxLength = 8;

    /// <summary>Supported locale codes; <see cref="Default"/> first.</summary>
    public static readonly IReadOnlyList<string> Supported = [Default, "en"];

    /// <summary>
    /// The supported code for <paramref name="locale"/> (trimmed, case ignored), <see cref="Default"/>
    /// when it is null or blank, or null when the language is not supported.
    /// </summary>
    public static string? Normalize(string? locale)
    {
        if (string.IsNullOrWhiteSpace(locale))
        {
            return Default;
        }

        var code = locale.Trim().ToLowerInvariant();
        return Supported.Contains(code) ? code : null;
    }
}
