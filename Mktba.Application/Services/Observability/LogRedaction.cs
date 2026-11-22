using System.Text;
using System.Text.RegularExpressions;

namespace Mktba.Application.Services.Observability;

/// <summary>
/// Removes what must not reach the log or an alert (X-05, #159; D9): e-mail addresses, the query
/// string and fragment of URLs (a search phrase, a token), JWT-like tokens, and control characters
/// other than line breaks and tabs. Text is cut to a length without splitting a surrogate pair.
/// </summary>
public static partial class LogRedaction
{
    public const string EmailMark = "[email]";
    public const string TokenMark = "[token]";

    public static string Redact(string? text, int maxLength)
    {
        if (string.IsNullOrEmpty(text))
        {
            return string.Empty;
        }

        var cleaned = StripControlCharacters(text);
        cleaned = UrlQuery().Replace(cleaned, "$1");
        cleaned = Email().Replace(cleaned, EmailMark);
        cleaned = Jwt().Replace(cleaned, TokenMark);
        return Truncate(cleaned.Trim(), maxLength);
    }

    /// <summary>The path of a site-relative or absolute URL, without query string and fragment; empty when it is not one.</summary>
    public static string PathOnly(string? url, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return string.Empty;
        }

        var value = url.Trim();
        var cut = value.IndexOfAny(['?', '#']);
        if (cut >= 0)
        {
            value = value[..cut];
        }

        if (Uri.TryCreate(value, UriKind.Absolute, out var absolute) && absolute.Scheme is "http" or "https")
        {
            value = absolute.AbsolutePath;
        }

        return value.StartsWith('/') ? Redact(value, maxLength) : string.Empty;
    }

    public static string Truncate(string text, int maxLength)
    {
        if (text.Length <= maxLength)
        {
            return text;
        }

        var end = char.IsHighSurrogate(text[maxLength - 1]) ? maxLength - 1 : maxLength;
        return text[..end] + "…";
    }

    private static string StripControlCharacters(string text)
    {
        var builder = new StringBuilder(text.Length);
        for (var index = 0; index < text.Length; index++)
        {
            var character = text[index];
            if (char.IsHighSurrogate(character) && index + 1 < text.Length && char.IsLowSurrogate(text[index + 1]))
            {
                builder.Append(character).Append(text[++index]);
            }
            else if (char.IsSurrogate(character))
            {
                continue;
            }
            else if (!char.IsControl(character) || character is '\n' or '\t')
            {
                builder.Append(character);
            }
            else if (character == '\r')
            {
                continue;
            }
            else
            {
                builder.Append(' ');
            }
        }

        return builder.ToString();
    }

    [GeneratedRegex(@"(https?://[^\s?#""'<>()]+)[?#][^\s""'<>()]*", RegexOptions.IgnoreCase)]
    private static partial Regex UrlQuery();

    [GeneratedRegex(@"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", RegexOptions.IgnoreCase)]
    private static partial Regex Email();

    [GeneratedRegex(@"\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+")]
    private static partial Regex Jwt();
}
