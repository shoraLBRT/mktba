using System.Text.RegularExpressions;

namespace Mktba.Infrastructure.Storage;

/// <summary>
/// Where uploaded files live (U-08, #73). Files are written once under a random name and never
/// changed; the name is all a caller knows of them (<see cref="StoredFileNames"/>).
/// </summary>
public interface IFileStorage
{
    /// <summary>Stores <paramref name="content"/> under <paramref name="name"/>.</summary>
    Task SaveAsync(string name, ReadOnlyMemory<byte> content, string contentType, CancellationToken cancellationToken);

    /// <summary>Opens a stored file for reading, or null when there is none by that name.</summary>
    Task<Stream?> OpenReadAsync(string name, CancellationToken cancellationToken);

    /// <summary>Removes a stored file; nothing happens when there is none by that name.</summary>
    Task DeleteAsync(string name, CancellationToken cancellationToken);
}

/// <summary>
/// The names of stored files: 32 lowercase hex characters (a random 128-bit value) and the
/// extension of one of the formats the site writes. Nothing a visitor typed ever becomes part of
/// a name, so a name is safe as a path segment and as an object key.
/// Private files (a scholar's documents, V-01 #117) are named <c>private/</c> + such a name: the
/// prefix keeps them out of everything that serves or finds public names (<see cref="IsValid"/>,
/// <c>GET /files/{name}</c>, <see cref="FindIn"/>), and on S3 it is a key prefix a bucket or CDN
/// rule can keep from ever being public. Only <see cref="IsStorable"/> accepts both.
/// </summary>
public static partial class StoredFileNames
{
    /// <summary>The formats stored files are written in, by extension.</summary>
    public static readonly IReadOnlyDictionary<string, string> ContentTypes = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        [".webp"] = "image/webp",
    };

    /// <summary>The formats private files are written in, by extension.</summary>
    public static readonly IReadOnlyDictionary<string, string> PrivateContentTypes = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        [".webp"] = "image/webp",
        [".pdf"] = "application/pdf",
    };

    /// <summary>What every private file's name starts with.</summary>
    public const string PrivatePrefix = "private/";

    /// <summary>A new random name with <paramref name="extension"/> (one of <see cref="ContentTypes"/>).</summary>
    public static string Create(string extension)
    {
        if (!ContentTypes.ContainsKey(extension))
        {
            throw new ArgumentOutOfRangeException(nameof(extension), extension, "Not a format stored files are written in.");
        }

        return Guid.NewGuid().ToString("N") + extension;
    }

    /// <summary>A new random private name with <paramref name="extension"/> (one of <see cref="PrivateContentTypes"/>).</summary>
    public static string CreatePrivate(string extension)
    {
        if (!PrivateContentTypes.ContainsKey(extension))
        {
            throw new ArgumentOutOfRangeException(nameof(extension), extension, "Not a format private files are written in.");
        }

        return PrivatePrefix + Guid.NewGuid().ToString("N") + extension;
    }

    /// <summary>Whether <paramref name="name"/> has the shape of a private file's name.</summary>
    public static bool IsPrivate(string? name) =>
        name is not null
        && name.StartsWith(PrivatePrefix, StringComparison.Ordinal)
        && NamePattern().IsMatch(name[PrivatePrefix.Length..])
        && PrivateContentTypes.ContainsKey(Path.GetExtension(name));

    /// <summary>Whether a storage may keep a file under <paramref name="name"/>: a public or a private name.</summary>
    public static bool IsStorable(string? name) => IsValid(name) || IsPrivate(name);

    /// <summary>Whether <paramref name="name"/> has the shape of a public stored file's name.</summary>
    public static bool IsValid(string? name) =>
        name is not null && NamePattern().IsMatch(name) && ContentTypes.ContainsKey(Path.GetExtension(name));

    /// <summary>The content type a stored file is served with, from its name; null for a name that is not valid.</summary>
    public static string? ContentTypeOf(string name) =>
        IsValid(name) ? ContentTypes[Path.GetExtension(name)] : null;

    /// <summary>
    /// Every stored file name found inside <paramref name="text"/> (a URL, Markdown, JSON), each once.
    /// A name is random, so finding it is finding a reference to that file, whatever address is in front.
    /// </summary>
    public static IEnumerable<string> FindIn(string? text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return [];
        }

        return EmbeddedNamePattern().Matches(text)
            .Select(match => match.Value)
            .Where(IsValid)
            .Distinct(StringComparer.Ordinal);
    }

    [GeneratedRegex("(?<![0-9A-Za-z])[0-9a-f]{32}\\.[a-z0-9]{3,4}(?![0-9A-Za-z])", RegexOptions.CultureInvariant)]
    private static partial Regex EmbeddedNamePattern();

    [GeneratedRegex("^[0-9a-f]{32}\\.[a-z0-9]{3,4}$", RegexOptions.CultureInvariant)]
    private static partial Regex NamePattern();
}
