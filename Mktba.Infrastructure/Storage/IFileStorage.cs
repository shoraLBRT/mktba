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
}

/// <summary>
/// The names of stored files: 32 lowercase hex characters (a random 128-bit value) and the
/// extension of one of the formats the site writes. Nothing a visitor typed ever becomes part of
/// a name, so a name is safe as a path segment and as an object key.
/// </summary>
public static partial class StoredFileNames
{
    /// <summary>The formats stored files are written in, by extension.</summary>
    public static readonly IReadOnlyDictionary<string, string> ContentTypes = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        [".webp"] = "image/webp",
    };

    /// <summary>A new random name with <paramref name="extension"/> (one of <see cref="ContentTypes"/>).</summary>
    public static string Create(string extension)
    {
        if (!ContentTypes.ContainsKey(extension))
        {
            throw new ArgumentOutOfRangeException(nameof(extension), extension, "Not a format stored files are written in.");
        }

        return Guid.NewGuid().ToString("N") + extension;
    }

    /// <summary>Whether <paramref name="name"/> has the shape of a stored file's name.</summary>
    public static bool IsValid(string? name) =>
        name is not null && NamePattern().IsMatch(name) && ContentTypes.ContainsKey(Path.GetExtension(name));

    /// <summary>The content type a stored file is served with, from its name; null for a name that is not valid.</summary>
    public static string? ContentTypeOf(string name) =>
        IsValid(name) ? ContentTypes[Path.GetExtension(name)] : null;

    [GeneratedRegex("^[0-9a-f]{32}\\.[a-z0-9]{3,4}$", RegexOptions.CultureInvariant)]
    private static partial Regex NamePattern();
}
