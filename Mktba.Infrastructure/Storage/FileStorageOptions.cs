namespace Mktba.Infrastructure.Storage;

/// <summary>
/// The <c>Storage</c> configuration section (U-08, #73): where uploaded files are kept.
/// <c>Local</c> (the default) writes them to a directory on the API's machine; <c>S3</c> to a
/// bucket of any S3-compatible service (Yandex Object Storage, AWS S3, MinIO…).
/// </summary>
public sealed class FileStorageOptions
{
    public const string SectionName = "Storage";

    /// <summary><c>Local</c> or <c>S3</c>.</summary>
    public string Provider { get; set; } = LocalProvider;

    public const string LocalProvider = "Local";

    public const string S3Provider = "S3";

    public LocalFileStorageOptions Local { get; set; } = new();

    public S3FileStorageOptions S3 { get; set; } = new();
}

public sealed class LocalFileStorageOptions
{
    /// <summary>The directory files are written to; a relative path is taken from the API's content root.</summary>
    public string RootPath { get; set; } = "App_Data/uploads";
}

public sealed class S3FileStorageOptions
{
    /// <summary>The service's endpoint, for example <c>https://storage.yandexcloud.net</c> or <c>http://localhost:9100</c>; empty for AWS itself.</summary>
    public string? ServiceUrl { get; set; }

    /// <summary>The signing region, for example <c>ru-central1</c> or <c>us-east-1</c>.</summary>
    public string Region { get; set; } = "us-east-1";

    public string Bucket { get; set; } = string.Empty;

    /// <summary>Prepended to every object name, for example <c>uploads/</c>; may be empty.</summary>
    public string KeyPrefix { get; set; } = string.Empty;

    /// <summary>Access key id. Keep it out of committed settings: user secrets, appsettings.local.json or the environment.</summary>
    public string? AccessKey { get; set; }

    /// <summary>Secret access key; the same rule as <see cref="AccessKey"/>.</summary>
    public string? SecretKey { get; set; }

    /// <summary>Path-style addressing (<c>host/bucket/key</c>), which MinIO needs.</summary>
    public bool ForcePathStyle { get; set; }
}
