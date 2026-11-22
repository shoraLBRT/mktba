namespace Mktba.Domain.Entities;

/// <summary>
/// The record of one uploaded file (U-08, #73): who uploaded it, when, what it is, and where the
/// site last found it used. The upload cleanup reads and updates it; the row outlives the file, so
/// <see cref="DeletedAt"/> says when the file itself was removed from the storage.
/// </summary>
public class StoredFile
{
    public const int NameMaxLength = 64;
    public const int ContentTypeMaxLength = 100;

    public int Id { get; set; }

    /// <summary>The name in the storage (a <c>StoredFileNames</c> name), unique.</summary>
    public string Name { get; set; } = string.Empty;

    public StoredFilePurpose Purpose { get; set; }

    public string ContentType { get; set; } = string.Empty;

    public long SizeBytes { get; set; }

    public int Width { get; set; }

    public int Height { get; set; }

    /// <summary>Who uploaded it; null once that user is deleted.</summary>
    public int? UploadedById { get; set; }

    public User? UploadedBy { get; set; }

    public DateTime UploadedAt { get; set; }

    /// <summary>Where the last cleanup run found the file referenced; <see cref="StoredFileUsage.None"/> before the first.</summary>
    public StoredFileUsage Usage { get; set; }

    /// <summary>When a cleanup run last looked for references to it; null before the first.</summary>
    public DateTime? LastCheckedAt { get; set; }

    /// <summary>
    /// Since when every cleanup run found it unreferenced; null while it is used (or not checked
    /// yet). Any run that finds a reference clears it again.
    /// </summary>
    public DateTime? UnusedSince { get; set; }

    /// <summary>When the file was removed from the storage; null while it is there.</summary>
    public DateTime? DeletedAt { get; set; }
}

/// <summary>What a file was uploaded for.</summary>
public enum StoredFilePurpose
{
    Avatar = 1,
    ArticleImage = 2,
}

/// <summary>Where a stored file is referenced from (U-08, #73); a file may be used in several places.</summary>
[Flags]
public enum StoredFileUsage
{
    None = 0,

    /// <summary>A user's <c>AvatarUrl</c>.</summary>
    Avatar = 1,

    /// <summary>The current content of an article: its texts, infobox, summary or social image.</summary>
    Article = 2,

    /// <summary>A saved revision of an article (its history, which a rollback can bring back).</summary>
    Revision = 4,

    /// <summary>An autosaved draft (E-02).</summary>
    Draft = 8,

    /// <summary>Anything else that holds a link: a profile's bio or links, a source.</summary>
    Other = 16,
}
