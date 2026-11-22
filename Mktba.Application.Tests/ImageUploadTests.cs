using System.Text;
using FluentAssertions;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Uploads;
using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Storage;
using SkiaSharp;

namespace Mktba.Application.Tests;

/// <summary>U-08 (#73): what an uploaded image becomes, what is refused, and where it is stored.</summary>
public sealed class ImageUploadTests : IDisposable
{
    private const int UploaderId = 7;

    private static readonly DateTime Now = new(2026, 11, 22, 10, 0, 0, DateTimeKind.Utc);

    private readonly string _root = Path.Combine(Path.GetTempPath(), $"mktba-upload-tests-{Guid.NewGuid():N}");

    private readonly MktbaDbContext _db = TestDbHelper.CreateInMemoryContext();

    public void Dispose()
    {
        _db.Dispose();
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    [Fact]
    public void GivenLargePng_WhenProcessedAsAvatar_ThenItIsWebpScaledDownKeepingItsShape()
    {
        var png = Encode(1024, 600, SKEncodedImageFormat.Png);

        var image = ImageProcessor.Process(png, ImageUploadService.AvatarMaxSide, 40_000_000);

        (image.Width, image.Height).Should().Be((512, 300));
        ImageProcessor.Sniff(image.Content).Should().Be(SKEncodedImageFormat.Webp);
        using var decoded = SKBitmap.Decode(image.Content);
        (decoded.Width, decoded.Height).Should().Be((512, 300));
    }

    [Fact]
    public void GivenSmallJpeg_WhenProcessed_ThenItKeepsItsSize()
    {
        var jpeg = Encode(40, 30, SKEncodedImageFormat.Jpeg);

        var image = ImageProcessor.Process(jpeg, ImageUploadService.ArticleImageMaxSide, 40_000_000);

        (image.Width, image.Height).Should().Be((40, 30));
    }

    [Fact]
    public void GivenJpegWithExifOrientation_WhenProcessed_ThenItIsTurnedUprightAndTheMetadataIsGone()
    {
        // Stored 40×20 with EXIF orientation 6: shown rotated a quarter turn clockwise, 20×40.
        var jpeg = WithExifOrientation(Encode(40, 20, SKEncodedImageFormat.Jpeg), 6);
        Encoding.ASCII.GetString(jpeg).Should().Contain("Exif");

        var image = ImageProcessor.Process(jpeg, ImageUploadService.ArticleImageMaxSide, 40_000_000);

        (image.Width, image.Height).Should().Be((20, 40));
        Encoding.ASCII.GetString(image.Content).Should().NotContain("Exif");
    }

    [Theory]
    [InlineData("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>")]
    [InlineData("GIF89a\u0001\u0000\u0001\u0000")]
    [InlineData("<html><body>hi</body></html>")]
    public void GivenFileThatIsNotJpegPngOrWebp_WhenProcessed_ThenItIsRefusedAsUnsupported(string content)
    {
        var act = () => ImageProcessor.Process(Encoding.UTF8.GetBytes(content), 512, 40_000_000);

        act.Should().Throw<ValidationException>().Which.Error.Code.Should().Be("upload_type_unsupported");
    }

    [Fact]
    public void GivenPngSignatureFollowedByGarbage_WhenProcessed_ThenItIsRefusedAsInvalid()
    {
        var bytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }.Concat(Encoding.ASCII.GetBytes("not really a png")).ToArray();

        var act = () => ImageProcessor.Process(bytes, 512, 40_000_000);

        act.Should().Throw<ValidationException>().Which.Error.Code.Should().Be("upload_image_invalid");
    }

    [Fact]
    public void GivenImageWithMorePixelsThanAllowed_WhenProcessed_ThenItIsRefusedBeforeDecoding()
    {
        var png = Encode(2000, 1000, SKEncodedImageFormat.Png);

        var act = () => ImageProcessor.Process(png, 512, 1_000_000);

        act.Should().Throw<ValidationException>().Which.Error.Code.Should().Be("upload_image_too_many_pixels");
    }

    [Fact]
    public async Task GivenImage_WhenUploaded_ThenItIsStoredUnderARandomWebpName()
    {
        var service = Service(maxBytes: 10 * 1024 * 1024);

        var first = await service.UploadAsync(new MemoryStream(Encode(64, 64, SKEncodedImageFormat.Png)), ImageUploadPurpose.Avatar, UploaderId, default);
        var second = await service.UploadAsync(new MemoryStream(Encode(64, 64, SKEncodedImageFormat.Png)), ImageUploadPurpose.Avatar, UploaderId, default);

        first.Name.Should().MatchRegex("^[0-9a-f]{32}\\.webp$");
        second.Name.Should().NotBe(first.Name);
        first.ContentType.Should().Be("image/webp");
        await using var stored = await new LocalFileStorage(_root).OpenReadAsync(first.Name, default);
        stored.Should().NotBeNull();
        stored!.Length.Should().Be(first.SizeBytes);
    }

    [Fact]
    public async Task GivenImage_WhenUploaded_ThenItIsRecordedWithItsUploaderTimeSizeAndType()
    {
        var stored = await Service(maxBytes: 10 * 1024 * 1024)
            .UploadAsync(new MemoryStream(Encode(800, 400, SKEncodedImageFormat.Png)), ImageUploadPurpose.ArticleImage, UploaderId, default);

        var record = await _db.StoredFiles.AsNoTracking().SingleAsync();
        record.Name.Should().Be(stored.Name);
        record.Purpose.Should().Be(StoredFilePurpose.ArticleImage);
        (record.ContentType, record.SizeBytes, record.Width, record.Height).Should().Be(("image/webp", stored.SizeBytes, 800, 400));
        record.UploadedById.Should().Be(UploaderId);
        record.UploadedAt.Should().Be(Now);
        (record.Usage, record.LastCheckedAt, record.UnusedSince, record.DeletedAt).Should().Be((StoredFileUsage.None, null, null, null));
    }

    [Fact]
    public async Task GivenRefusedFile_WhenUploaded_ThenNothingIsRecorded()
    {
        var act = () => Service(maxBytes: 1024).UploadAsync(new MemoryStream(new byte[2048]), ImageUploadPurpose.Avatar, UploaderId, default);

        await act.Should().ThrowAsync<ValidationException>();
        (await _db.StoredFiles.CountAsync()).Should().Be(0);
    }

    [Theory]
    [InlineData("![chart](https://api.mktba.ru/files/0123456789abcdef0123456789abcdef.webp)", "0123456789abcdef0123456789abcdef.webp")]
    [InlineData("{\"text\":\"/files/0123456789abcdef0123456789abcdef.webp?x=1\"}", "0123456789abcdef0123456789abcdef.webp")]
    [InlineData("https://cdn.example/uploads/0123456789abcdef0123456789abcdef.webp", "0123456789abcdef0123456789abcdef.webp")]
    [InlineData("ff0123456789abcdef0123456789abcdef.webp", null)]
    [InlineData("0123456789abcdef0123456789abcdef.svg", null)]
    [InlineData("0123456789abcdef0123456789abcdef.webpx", null)]
    public void GivenText_WhenSearchedForStoredFileNames_ThenOnlyWholeNamesAreFound(string text, string? expected)
    {
        var found = StoredFileNames.FindIn(text).ToList();

        found.Should().Equal(expected is null ? [] : [expected]);
    }

    [Fact]
    public async Task GivenStoredFile_WhenDeleted_ThenItIsGoneAndDeletingAgainIsHarmless()
    {
        var storage = new LocalFileStorage(_root);
        var name = StoredFileNames.Create(".webp");
        await storage.SaveAsync(name, new byte[] { 1, 2, 3 }, "image/webp", default);

        await storage.DeleteAsync(name, default);
        await storage.DeleteAsync(name, default);

        (await storage.OpenReadAsync(name, default)).Should().BeNull();
    }

    [Fact]
    public async Task GivenFileOverTheLimit_WhenUploaded_ThenItIsRefusedAndNothingIsStored()
    {
        var service = Service(maxBytes: 1024);

        var act = () => service.UploadAsync(new MemoryStream(new byte[2048]), ImageUploadPurpose.Avatar, UploaderId, default);

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("upload_too_large");
        Directory.Exists(_root).Should().BeFalse();
    }

    [Fact]
    public async Task GivenEmptyFile_WhenUploaded_ThenItIsRefusedAsMissing()
    {
        var act = () => Service(maxBytes: 1024).UploadAsync(new MemoryStream(), ImageUploadPurpose.Avatar, UploaderId, default);

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("upload_file_required");
    }

    [Theory]
    [InlineData("../secrets.webp")]
    [InlineData("0123456789abcdef0123456789ABCDEF.webp")]
    [InlineData("0123456789abcdef0123456789abcdef.svg")]
    [InlineData("0123456789abcdef0123456789abcdef.html")]
    [InlineData("0123456789abcdef0123456789abcdef")]
    public async Task GivenNameThatIsNotAStoredFileName_WhenRead_ThenTheStorageRefusesIt(string name)
    {
        StoredFileNames.IsValid(name).Should().BeFalse();

        var act = () => new LocalFileStorage(_root).OpenReadAsync(name, default);

        await act.Should().ThrowAsync<ArgumentException>();
    }

    [Fact]
    public async Task GivenUnknownName_WhenRead_ThenThereIsNoFile()
    {
        var stream = await new LocalFileStorage(_root).OpenReadAsync(StoredFileNames.Create(".webp"), default);

        stream.Should().BeNull();
    }

    private ImageUploadService Service(long maxBytes) =>
        new(new LocalFileStorage(_root), _db, new FeedbackTests.FakeClock(Now), Options.Create(new UploadOptions { MaxBytes = maxBytes, MaxPixels = 40_000_000 }));

    internal static byte[] Encode(int width, int height, SKEncodedImageFormat format)
    {
        using var bitmap = new SKBitmap(width, height);
        using (var canvas = new SKCanvas(bitmap))
        {
            canvas.Clear(SKColors.SteelBlue);
            using var paint = new SKPaint { Color = SKColors.Orange };
            canvas.DrawRect(0, 0, width / 2f, height / 2f, paint);
        }

        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(format, 90);
        return data.ToArray();
    }

    /// <summary>The JPEG with an EXIF segment holding only the orientation tag, right after its start marker.</summary>
    private static byte[] WithExifOrientation(byte[] jpeg, ushort orientation)
    {
        byte[] tiff =
        [
            (byte)'I', (byte)'I', 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, // little-endian header, IFD at 8
            0x01, 0x00, // one entry
            0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, (byte)orientation, 0x00, 0x00, 0x00, // Orientation, SHORT, 1
            0x00, 0x00, 0x00, 0x00, // no next IFD
        ];
        var payload = Encoding.ASCII.GetBytes("Exif\0\0").Concat(tiff).ToArray();
        var length = payload.Length + 2;
        byte[] segment = [0xFF, 0xE1, (byte)(length >> 8), (byte)(length & 0xFF), .. payload];
        return [.. jpeg[..2], .. segment, .. jpeg[2..]];
    }
}
