namespace Mktba.Application.Configuration;

/// <summary>The <c>Uploads</c> configuration section (U-08, #73); where the files go is the <c>Storage</c> section.</summary>
public sealed class UploadOptions
{
    public const string SectionName = "Uploads";

    /// <summary>The largest file accepted, in bytes.</summary>
    public long MaxBytes { get; set; } = 10 * 1024 * 1024;

    /// <summary>The most pixels (width × height) an uploaded image may have, checked before it is decoded.</summary>
    public long MaxPixels { get; set; } = 40_000_000;

    /// <summary>
    /// The address stored files are reachable at, ending in <c>/</c>, for example a public bucket or a
    /// CDN in front of it (<c>https://cdn.mktba.ru/uploads/</c>). The file's name is appended to it.
    /// Empty: the API's own <c>GET /files/{name}</c> on the address the upload request came to.
    /// </summary>
    public string? PublicBaseUrl { get; set; }
}
