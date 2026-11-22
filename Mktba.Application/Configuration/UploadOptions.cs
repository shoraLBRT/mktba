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

    /// <summary>Removing files nothing uses any more (<c>Uploads:Cleanup</c>).</summary>
    public UploadCleanupOptions Cleanup { get; set; } = new();
}

/// <summary>
/// The <c>Uploads:Cleanup</c> section (U-08, #73). A file is removed only after it is older than
/// <see cref="UnusedDays"/> and every run for <see cref="UnusedDays"/> more found no reference to it.
/// </summary>
public sealed class UploadCleanupOptions
{
    /// <summary>False: runs still record where files are used, but never remove one.</summary>
    public bool DeleteUnused { get; set; } = true;

    /// <summary>
    /// The grace period, in days: how old a file must be before it is looked at, and how long it then
    /// has to stay unreferenced. Not below the 30 days an abandoned draft is kept, so an image only a
    /// draft uses outlives the draft's own grace.
    /// </summary>
    public int UnusedDays { get; set; } = 30;

    /// <summary>How often the cleanup runs, in hours.</summary>
    public int IntervalHours { get; set; } = 6;

    public TimeSpan GracePeriod => TimeSpan.FromDays(Math.Max(1, UnusedDays));

    public TimeSpan Interval => TimeSpan.FromHours(Math.Max(1, IntervalHours));
}
