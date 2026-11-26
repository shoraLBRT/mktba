using Mktba.Application.Exceptions;
using Mktba.Application.Services.Uploads;

namespace Mktba.Application.Services.Verification;

/// <summary>A document as it will be stored: its bytes, format and, for an image, its size.</summary>
public sealed record ProcessedDocument(byte[] Content, string Extension, string ContentType, int Width, int Height);

/// <summary>
/// Checks a document attached to a scholar's application (V-01, #117) and turns it into what is
/// stored. The format is told from the file's first bytes only, never from its name or the
/// Content-Type the client sent:
/// <list type="bullet">
/// <item>JPEG, PNG and WebP — a photo or a scan — go through <see cref="ImageProcessor"/> like any
/// upload: turned upright, scaled down to <see cref="ImageMaxSide"/> px (enough to read a diploma)
/// and re-encoded as WebP, so EXIF (camera, GPS) and other metadata are gone.</item>
/// <item>PDF is kept byte for byte. It is never rendered or parsed on the server: the file must start
/// with the <c>%PDF-x.y</c> header and carry the <c>%%EOF</c> marker in its last
/// <see cref="PdfTrailerWindow"/> bytes, which refuses other files renamed to .pdf and truncated
/// uploads. It is only ever handed out as a download (Content-Disposition: attachment).</item>
/// </list>
/// Anything else is refused with <c>scholar_document_type_unsupported</c>.
/// </summary>
public static class ScholarDocumentProcessor
{
    public const int ImageMaxSide = 4096;

    public const string PdfExtension = ".pdf";

    public const string PdfContentType = "application/pdf";

    /// <summary>How far from the end the <c>%%EOF</c> marker may be (trailing white space, an appended newline).</summary>
    public const int PdfTrailerWindow = 1024;

    public static ProcessedDocument Process(byte[] input, long maxPixels)
    {
        if (ImageProcessor.Sniff(input) is not null)
        {
            var image = ImageProcessor.Process(input, ImageMaxSide, maxPixels);
            return new ProcessedDocument(image.Content, ImageProcessor.OutputExtension, ImageProcessor.OutputContentType, image.Width, image.Height);
        }

        if (HasPdfHeader(input))
        {
            if (!HasPdfTrailer(input))
            {
                throw new ValidationException(AppErrors.ScholarDocumentPdfInvalid);
            }

            return new ProcessedDocument(input, PdfExtension, PdfContentType, 0, 0);
        }

        throw new ValidationException(AppErrors.ScholarDocumentTypeUnsupported);
    }

    /// <summary><c>%PDF-</c>, a digit, a dot and a digit at the very start.</summary>
    internal static bool HasPdfHeader(ReadOnlySpan<byte> bytes) =>
        bytes.Length >= 8
        && bytes[..5].SequenceEqual("%PDF-"u8)
        && char.IsAsciiDigit((char)bytes[5])
        && bytes[6] == (byte)'.'
        && char.IsAsciiDigit((char)bytes[7]);

    internal static bool HasPdfTrailer(ReadOnlySpan<byte> bytes)
    {
        var tail = bytes.Length > PdfTrailerWindow ? bytes[^PdfTrailerWindow..] : bytes;
        return tail.IndexOf("%%EOF"u8) >= 0;
    }
}
