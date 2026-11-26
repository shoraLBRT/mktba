using System.Text;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Verification;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Storage;
using SkiaSharp;

namespace Mktba.Application.Tests;

/// <summary>V-01 (#117): the application for the scholar status, its documents and what is refused.</summary>
public sealed class ScholarApplicationTests : IDisposable
{
    private static readonly DateTime Now = new(2026, 11, 26, 10, 0, 0, DateTimeKind.Utc);

    private readonly string _root = Path.Combine(Path.GetTempPath(), $"mktba-scholar-tests-{Guid.NewGuid():N}");
    private readonly MktbaDbContext _db = TestDbHelper.CreateInMemoryContext();
    private readonly FeedbackTests.FakeClock _clock = new(Now);
    private readonly LocalFileStorage _storage;

    public ScholarApplicationTests()
    {
        _storage = new LocalFileStorage(_root);
        _db.Schools.Add(new School { Name = "Ханафитский", Slug = "hanafi", IsSystem = true });
        _db.SaveChanges();
    }

    public void Dispose()
    {
        _db.Dispose();
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    internal static byte[] Pdf(string body = "1 0 obj << >> endobj") =>
        Encoding.ASCII.GetBytes($"%PDF-1.7\n{body}\ntrailer << >>\n%%EOF\n");

    [Fact]
    public void GivenPdfWithHeaderAndTrailer_WhenProcessed_ThenItIsKeptByteForByte()
    {
        var pdf = Pdf();

        var document = ScholarDocumentProcessor.Process(pdf, 40_000_000);

        document.Content.Should().Equal(pdf);
        (document.Extension, document.ContentType, document.Width, document.Height).Should().Be((".pdf", "application/pdf", 0, 0));
    }

    [Fact]
    public void GivenPdfWithoutTrailer_WhenProcessed_ThenItIsRefusedAsInvalid()
    {
        var truncated = Encoding.ASCII.GetBytes("%PDF-1.4\n1 0 obj << >> endobj\n");

        var act = () => ScholarDocumentProcessor.Process(truncated, 40_000_000);

        act.Should().Throw<ValidationException>().Which.Error.Code.Should().Be("scholar_document_pdf_invalid");
    }

    [Fact]
    public void GivenPdfWhoseTrailerIsFarFromTheEnd_WhenProcessed_ThenItIsRefusedAsInvalid()
    {
        var pdf = Pdf().Concat(Enumerable.Repeat((byte)'x', ScholarDocumentProcessor.PdfTrailerWindow)).ToArray();

        var act = () => ScholarDocumentProcessor.Process(pdf, 40_000_000);

        act.Should().Throw<ValidationException>().Which.Error.Code.Should().Be("scholar_document_pdf_invalid");
    }

    [Theory]
    [InlineData("just text %%EOF")]
    [InlineData("%PDF-x.y\n%%EOF")]
    [InlineData("<html><script>alert(1)</script></html>")]
    [InlineData(" %PDF-1.7\n%%EOF")]
    public void GivenFileThatIsNeitherPdfNorImage_WhenProcessed_ThenItIsRefusedAsUnsupported(string content)
    {
        var act = () => ScholarDocumentProcessor.Process(Encoding.ASCII.GetBytes(content), 40_000_000);

        act.Should().Throw<ValidationException>().Which.Error.Code.Should().Be("scholar_document_type_unsupported");
    }

    [Fact]
    public void GivenLargeJpegScan_WhenProcessed_ThenItIsWebpWithinTheDocumentSize()
    {
        var jpeg = ImageUploadTests.Encode(5000, 2500, SKEncodedImageFormat.Jpeg);

        var document = ScholarDocumentProcessor.Process(jpeg, 40_000_000);

        (document.Extension, document.ContentType, document.Width, document.Height).Should().Be((".webp", "image/webp", 4096, 2048));
    }

    [Theory]
    [InlineData("C:\\Users\\me\\Диплом.jpg", ".webp", "Диплом.webp")]
    [InlineData("../../etc/passwd", ".pdf", "passwd.pdf")]
    [InlineData("  line\nbreak .pdf", ".pdf", "line break.pdf")]
    [InlineData(null, ".pdf", "document.pdf")]
    [InlineData(".pdf", ".pdf", "document.pdf")]
    public void GivenClientFileName_WhenMadeADisplayName_ThenOnlyTheOneLineBaseNameIsKeptWithTheStoredExtension(string? name, string extension, string expected)
    {
        ScholarApplicationService.DisplayFileName(name, extension).Should().Be(expected);
    }

    [Fact]
    public void GivenVeryLongFileName_WhenMadeADisplayName_ThenItFitsTheColumn()
    {
        var name = ScholarApplicationService.DisplayFileName(new string('а', 500) + ".pdf", ".pdf");

        name.Length.Should().Be(ScholarApplicationDocument.FileNameMaxLength);
        name.Should().EndWith(".pdf");
    }

    [Fact]
    public void GivenPrivateName_WhenChecked_ThenOnlyTheStorageAcceptsIt()
    {
        var name = StoredFileNames.CreatePrivate(".pdf");

        name.Should().MatchRegex("^private/[0-9a-f]{32}\\.pdf$");
        StoredFileNames.IsPrivate(name).Should().BeTrue();
        StoredFileNames.IsStorable(name).Should().BeTrue();
        StoredFileNames.IsValid(name).Should().BeFalse();
        StoredFileNames.ContentTypeOf(name).Should().BeNull();
        StoredFileNames.IsPrivate("private/../" + name[8..]).Should().BeFalse();
        StoredFileNames.IsValid(name[8..]).Should().BeFalse("a PDF never has a public name");
    }

    [Fact]
    public async Task GivenReader_WhenApplying_ThenTheApplicationIsPendingAndItsDocumentsArePrivateRecords()
    {
        var userId = await UserAsync(UserRole.Reader);
        var png = ImageUploadTests.Encode(40, 30, SKEncodedImageFormat.Png);

        var application = await Service().SubmitAsync(
            userId,
            new ScholarApplicationInput("  Доктор   наук ", "Университет аль-Азхар", "Фикх", "Hanafi"),
            [new ScholarDocumentUpload("диплом.pdf", new MemoryStream(Pdf())), new ScholarDocumentUpload("скан.png", new MemoryStream(png))],
            default);

        application.Status.Should().Be(ScholarApplicationStatus.Pending);
        (application.Degree, application.Mazhab, application.SubmittedAt).Should().Be(("Доктор наук", "hanafi", Now));
        application.Documents.Select(document => (document.FileName, document.ContentType))
            .Should().Equal(("диплом.pdf", "application/pdf"), ("скан.webp", "image/webp"));
        var records = await _db.StoredFiles.AsNoTracking().ToListAsync();
        records.Should().HaveCount(2).And.OnlyContain(record =>
            record.Purpose == StoredFilePurpose.ScholarDocument && record.UploadedById == userId && StoredFileNames.IsPrivate(record.Name));
        File.Exists(Path.Combine(_root, records[0].Name)).Should().BeTrue();
    }

    [Fact]
    public async Task GivenOneRefusedDocument_WhenApplying_ThenNothingIsStoredOrRecorded()
    {
        var userId = await UserAsync(UserRole.Author);

        var act = () => Service().SubmitAsync(
            userId,
            Input(),
            [new ScholarDocumentUpload("ok.pdf", new MemoryStream(Pdf())), new ScholarDocumentUpload("bad.pdf", new MemoryStream("MZ\x90"u8.ToArray()))],
            default);

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("scholar_document_type_unsupported");
        (await _db.StoredFiles.CountAsync()).Should().Be(0);
        (await _db.ScholarApplications.CountAsync()).Should().Be(0);
        Directory.Exists(_root).Should().BeFalse();
    }

    [Theory]
    [InlineData(UserRole.Scholar)]
    [InlineData(UserRole.Admin)]
    public async Task GivenScholarOrAdmin_WhenApplying_ThenItIsRefusedAndTheyCannotApply(UserRole role)
    {
        var userId = await UserAsync(role);

        var act = () => Service().SubmitAsync(userId, Input(), [Document()], default);

        (await act.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("scholar_application_role_not_allowed");
        (await Service().GetMineAsync(userId, default)).CanApply.Should().BeFalse();
    }

    [Fact]
    public async Task GivenPendingApplication_WhenApplyingAgain_ThenItIsRefused()
    {
        var userId = await UserAsync(UserRole.Reader);
        await Service().SubmitAsync(userId, Input(), [Document()], default);

        var act = () => Service().SubmitAsync(userId, Input(), [Document()], default);

        (await act.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("scholar_application_already_pending");
        (await Service().GetMineAsync(userId, default)).CanApply.Should().BeFalse();
    }

    [Fact]
    public async Task GivenPendingApplication_WhenWithdrawn_ThenItsDocumentsAreDeletedAndTheUserMayApplyAgain()
    {
        var userId = await UserAsync(UserRole.Reader);
        await Service().SubmitAsync(userId, Input(), [Document()], default);
        var name = (await _db.StoredFiles.AsNoTracking().SingleAsync()).Name;
        _clock.Advance(TimeSpan.FromHours(1));

        var state = await Service().WithdrawAsync(userId, default);

        state.CanApply.Should().BeTrue();
        (state.Application!.Status, state.Application.ClosedAt).Should().Be((ScholarApplicationStatus.Withdrawn, Now.AddHours(1)));
        state.Application.Documents.Should().BeEmpty();
        File.Exists(Path.Combine(_root, name)).Should().BeFalse();
        (await _db.StoredFiles.AsNoTracking().SingleAsync()).DeletedAt.Should().Be(Now.AddHours(1));

        var again = await Service().SubmitAsync(userId, Input(), [Document()], default);
        again.Status.Should().Be(ScholarApplicationStatus.Pending);
        (await Service().GetMineAsync(userId, default)).Application!.Id.Should().Be(again.Id);
    }

    [Fact]
    public async Task GivenNothingPending_WhenWithdrawing_ThenItIsNotFound()
    {
        var userId = await UserAsync(UserRole.Reader);

        var act = () => Service().WithdrawAsync(userId, default);

        (await act.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("scholar_application_not_found");
    }

    [Theory]
    [InlineData(" ", "Институт", "Фикх", null, "scholar_application_degree_required")]
    [InlineData("Магистр", "", "Фикх", null, "scholar_application_institution_required")]
    [InlineData("Магистр", "Институт", "\n", null, "scholar_application_specialization_required")]
    [InlineData("Магистр", "Институт", "Фикх", "zahiri", "scholar_application_mazhab_invalid")]
    public async Task GivenMissingOrUnknownValue_WhenApplying_ThenItIsRefusedByCode(
        string degree, string institution, string specialization, string? mazhab, string code)
    {
        var userId = await UserAsync(UserRole.Reader);

        var act = () => Service().SubmitAsync(userId, new ScholarApplicationInput(degree, institution, specialization, mazhab), [Document()], default);

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be(code);
    }

    [Fact]
    public async Task GivenTooLongDegree_WhenApplying_ThenItIsRefusedWithTheLimit()
    {
        var userId = await UserAsync(UserRole.Reader);

        var act = () => Service().SubmitAsync(
            userId, new ScholarApplicationInput(new string('д', 151), "Институт", "Фикх", null), [Document()], default);

        var error = (await act.Should().ThrowAsync<ValidationException>()).Which.Error;
        error.Code.Should().Be("scholar_application_degree_too_long");
        error.Params!["maxLength"].Should().Be(150);
    }

    [Theory]
    [InlineData(0, "scholar_application_documents_required")]
    [InlineData(6, "scholar_application_documents_too_many")]
    public async Task GivenNoOrTooManyDocuments_WhenApplying_ThenItIsRefused(int count, string code)
    {
        var userId = await UserAsync(UserRole.Reader);

        var act = () => Service().SubmitAsync(userId, Input(), Enumerable.Range(0, count).Select(_ => Document()).ToList(), default);

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be(code);
    }

    [Fact]
    public async Task GivenDocumentLargerThanTheUploadLimit_WhenApplying_ThenItIsRefused()
    {
        var userId = await UserAsync(UserRole.Reader);
        var service = new ScholarApplicationService(_db, _storage, _clock, Options.Create(new UploadOptions { MaxBytes = 64 }));

        var act = () => service.SubmitAsync(userId, Input(), [new ScholarDocumentUpload("big.pdf", new MemoryStream(Pdf(new string('x', 100))))], default);

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("upload_too_large");
    }

    [Fact]
    public async Task GivenDocument_WhenOpenedByTheApplicantAnAdminOrAnotherUser_ThenOnlyTheFirstTwoGetIt()
    {
        var applicantId = await UserAsync(UserRole.Reader);
        var adminId = await UserAsync(UserRole.Admin);
        var otherId = await UserAsync(UserRole.Author);
        var application = await Service().SubmitAsync(applicantId, Input(), [Document()], default);
        var documentId = application.Documents[0].Id;

        foreach (var callerId in new[] { applicantId, adminId })
        {
            var file = await Service().OpenDocumentAsync(documentId, callerId, default);
            await using var content = file.Content;
            using var copy = new MemoryStream();
            await content.CopyToAsync(copy);
            copy.ToArray().Should().Equal(Pdf());
            (file.ContentType, file.FileName).Should().Be(("application/pdf", "диплом.pdf"));
        }

        var act = () => Service().OpenDocumentAsync(documentId, otherId, default);
        (await act.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("scholar_document_not_found");
    }

    private ScholarApplicationService Service() => new(_db, _storage, _clock, Options.Create(new UploadOptions()));

    private static ScholarApplicationInput Input() => new("Магистр", "Институт", "Фикх", null);

    private static ScholarDocumentUpload Document() => new("диплом.pdf", new MemoryStream(Pdf()));

    private async Task<int> UserAsync(UserRole role)
    {
        var user = new User { Email = $"{Guid.NewGuid():N}@mktba.test", Role = role };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user.Id;
    }
}
