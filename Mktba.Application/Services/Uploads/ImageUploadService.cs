using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.Exceptions;
using Mktba.Infrastructure.Storage;

namespace Mktba.Application.Services.Uploads;

/// <summary>What an uploaded image is for; it sets how large the stored image may be.</summary>
public enum ImageUploadPurpose
{
    /// <summary>A user's avatar (U-07): at most 512 px on its longer side.</summary>
    Avatar = 1,

    /// <summary>An image inside an article: at most 2048 px on its longer side.</summary>
    ArticleImage = 2,
}

/// <summary>A stored image: its file name (see <see cref="StoredFileNames"/>) and what it became.</summary>
public sealed record StoredImage(string Name, string ContentType, int Width, int Height, long SizeBytes);

/// <summary>
/// Takes an uploaded image in (U-08, #73): reads at most <see cref="UploadOptions.MaxBytes"/>,
/// re-encodes it (<see cref="ImageProcessor"/>) and stores the result under a new random name.
/// Nothing is stored for a file that is refused.
/// </summary>
public sealed class ImageUploadService
{
    public const int AvatarMaxSide = 512;

    public const int ArticleImageMaxSide = 2048;

    private readonly IFileStorage _storage;
    private readonly UploadOptions _options;

    public ImageUploadService(IFileStorage storage, IOptions<UploadOptions> options)
    {
        _storage = storage;
        _options = options.Value;
    }

    public async Task<StoredImage> UploadAsync(Stream content, ImageUploadPurpose purpose, CancellationToken cancellationToken)
    {
        var bytes = await ReadAtMostAsync(content, _options.MaxBytes, cancellationToken);
        if (bytes.Length == 0)
        {
            throw new ValidationException(AppErrors.UploadFileRequired);
        }

        var maxSide = purpose == ImageUploadPurpose.Avatar ? AvatarMaxSide : ArticleImageMaxSide;
        var image = ImageProcessor.Process(bytes, maxSide, _options.MaxPixels);

        var name = StoredFileNames.Create(ImageProcessor.OutputExtension);
        await _storage.SaveAsync(name, image.Content, ImageProcessor.OutputContentType, cancellationToken);
        return new StoredImage(name, ImageProcessor.OutputContentType, image.Width, image.Height, image.Content.Length);
    }

    /// <summary>The file to its end, refused as soon as it passes <paramref name="maxBytes"/>.</summary>
    private static async Task<byte[]> ReadAtMostAsync(Stream content, long maxBytes, CancellationToken cancellationToken)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await content.ReadAsync(chunk, cancellationToken)) > 0)
        {
            if (buffer.Length + read > maxBytes)
            {
                throw new ValidationException(AppErrors.UploadTooLarge(MaxMegabytes(maxBytes)));
            }

            buffer.Write(chunk, 0, read);
        }

        return buffer.ToArray();
    }

    public static int MaxMegabytes(long maxBytes) => (int)Math.Max(1, maxBytes / (1024 * 1024));
}
