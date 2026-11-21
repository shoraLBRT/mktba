using Mktba.Application.Exceptions;
using SkiaSharp;

namespace Mktba.Application.Services.Uploads;

/// <summary>An image re-encoded for the site: WebP, upright, within the size its use allows, without metadata.</summary>
public sealed record ProcessedImage(byte[] Content, int Width, int Height);

/// <summary>
/// Turns an uploaded file into an image the site can serve (U-08, #73). The format is told from the
/// file's first bytes, never from its name or the Content-Type the client sent; only JPEG, PNG and
/// WebP are accepted (no SVG, GIF or anything that can carry script). The image is decoded, turned
/// upright by its EXIF orientation, scaled down to fit <c>maxSide</c> and written anew as WebP, so
/// nothing of the original file but its pixels is kept: EXIF (camera, GPS), XMP, ICC profiles and
/// whatever else rode along are gone. The pixel count is checked from the header before decoding,
/// so a small file claiming a huge image is refused without allocating it.
/// </summary>
public static class ImageProcessor
{
    public const string OutputExtension = ".webp";

    public const string OutputContentType = "image/webp";

    private const int WebpQuality = 85;

    public static ProcessedImage Process(byte[] input, int maxSide, long maxPixels)
    {
        var format = Sniff(input) ?? throw new ValidationException(AppErrors.UploadTypeUnsupported);

        using var data = SKData.CreateCopy(input);
        using var codec = SKCodec.Create(data) ?? throw new ValidationException(AppErrors.UploadImageInvalid);
        if (codec.EncodedFormat != format)
        {
            throw new ValidationException(AppErrors.UploadImageInvalid);
        }

        var width = codec.Info.Width;
        var height = codec.Info.Height;
        if (width <= 0 || height <= 0)
        {
            throw new ValidationException(AppErrors.UploadImageInvalid);
        }

        if ((long)width * height > maxPixels)
        {
            throw new ValidationException(AppErrors.UploadImageTooManyPixels((int)Math.Max(1, maxPixels / 1_000_000)));
        }

        var decodeInfo = new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul, SKColorSpace.CreateSrgb());
        using var bitmap = new SKBitmap(decodeInfo);
        var result = codec.GetPixels(decodeInfo, bitmap.GetPixels());
        if (result is not (SKCodecResult.Success or SKCodecResult.IncompleteInput))
        {
            throw new ValidationException(AppErrors.UploadImageInvalid);
        }

        var origin = codec.EncodedOrigin;
        var swapsSides = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var uprightWidth = swapsSides ? height : width;
        var uprightHeight = swapsSides ? width : height;

        var scale = Math.Min(1.0, (double)maxSide / Math.Max(uprightWidth, uprightHeight));
        var targetWidth = Math.Max(1, (int)Math.Round(uprightWidth * scale));
        var targetHeight = Math.Max(1, (int)Math.Round(uprightHeight * scale));

        var targetInfo = new SKImageInfo(targetWidth, targetHeight, SKColorType.Rgba8888, SKAlphaType.Premul, SKColorSpace.CreateSrgb());
        using var surface = SKSurface.Create(targetInfo) ?? throw new ValidationException(AppErrors.UploadImageInvalid);
        var canvas = surface.Canvas;
        canvas.Clear(SKColors.Transparent);
        canvas.SetMatrix(SKMatrix.Concat(
            SKMatrix.CreateScale((float)targetWidth / uprightWidth, (float)targetHeight / uprightHeight),
            OrientationMatrix(origin, width, height)));
        using (var image = SKImage.FromBitmap(bitmap))
        {
            canvas.DrawImage(image, 0, 0, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
        }

        canvas.Flush();
        using var snapshot = surface.Snapshot();
        using var encoded = snapshot.Encode(SKEncodedImageFormat.Webp, WebpQuality)
            ?? throw new InvalidOperationException("The image could not be encoded as WebP.");
        return new ProcessedImage(encoded.ToArray(), targetWidth, targetHeight);
    }

    /// <summary>The format the file's signature names, or null for anything but JPEG, PNG and WebP.</summary>
    internal static SKEncodedImageFormat? Sniff(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF)
        {
            return SKEncodedImageFormat.Jpeg;
        }

        if (bytes.Length >= 8 && bytes[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }))
        {
            return SKEncodedImageFormat.Png;
        }

        if (bytes.Length >= 12 && bytes[..4].SequenceEqual("RIFF"u8) && bytes[8..12].SequenceEqual("WEBP"u8))
        {
            return SKEncodedImageFormat.Webp;
        }

        return null;
    }

    /// <summary>Maps the stored pixels (<paramref name="width"/> × <paramref name="height"/>) onto the upright image.</summary>
    private static SKMatrix OrientationMatrix(SKEncodedOrigin origin, int width, int height) => origin switch
    {
        SKEncodedOrigin.TopRight => new SKMatrix(-1, 0, width, 0, 1, 0, 0, 0, 1),
        SKEncodedOrigin.BottomRight => new SKMatrix(-1, 0, width, 0, -1, height, 0, 0, 1),
        SKEncodedOrigin.BottomLeft => new SKMatrix(1, 0, 0, 0, -1, height, 0, 0, 1),
        SKEncodedOrigin.LeftTop => new SKMatrix(0, 1, 0, 1, 0, 0, 0, 0, 1),
        SKEncodedOrigin.RightTop => new SKMatrix(0, -1, height, 1, 0, 0, 0, 0, 1),
        SKEncodedOrigin.RightBottom => new SKMatrix(0, -1, height, -1, 0, width, 0, 0, 1),
        SKEncodedOrigin.LeftBottom => new SKMatrix(0, 1, 0, -1, 0, width, 0, 0, 1),
        _ => SKMatrix.Identity,
    };
}
