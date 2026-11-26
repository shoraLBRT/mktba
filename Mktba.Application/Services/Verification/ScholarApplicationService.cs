using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Uploads;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Storage;

namespace Mktba.Application.Services.Verification;

/// <summary>What the applicant writes in an application; every value is trimmed and checked by the service.</summary>
public sealed record ScholarApplicationInput(string? Degree, string? Institution, string? Specialization, string? Mazhab);

/// <summary>One attached file as it arrived: the name the client gave it and its content.</summary>
public sealed record ScholarDocumentUpload(string? FileName, Stream Content);

/// <summary>A document opened for reading: its content, type and the name to download it under.</summary>
public sealed record ScholarDocumentFile(Stream Content, string ContentType, string FileName);

/// <summary>
/// Applications for the scholar status (V-01, #117). A reader or an author applies with their
/// degree, institution, specialization, madhab and 1–<see cref="ScholarApplication.MaxDocuments"/>
/// documents; the application stays <see cref="ScholarApplicationStatus.Pending"/> until an admin
/// decides (V-02, #118) or the applicant withdraws it. Defaults chosen here, open for the owner in
/// #117: one pending application per user; applying again after a withdrawal or a refusal is
/// allowed; scholars and admins do not apply; a withdrawal deletes the documents at once.
/// </summary>
/// <remarks>
/// Documents are personal data: they are stored under private names
/// (<see cref="StoredFileNames.CreatePrivate"/>), recorded as <see cref="StoredFilePurpose.ScholarDocument"/>
/// (which the upload cleanup skips) and read only through <see cref="OpenDocumentAsync"/> by the
/// applicant or an admin. When an application gives them up (a withdrawal here, a refusal or a
/// revocation in <see cref="ScholarApplicationReviewService"/>), the files are deleted only after the
/// new status is saved (<see cref="DeleteDetachedFilesAsync"/>).
/// </remarks>
public sealed class ScholarApplicationService
{
    private readonly MktbaDbContext _db;
    private readonly IFileStorage _storage;
    private readonly TimeProvider _clock;
    private readonly UploadOptions _options;
    private readonly ILogger<ScholarApplicationService> _logger;

    public ScholarApplicationService(
        MktbaDbContext db, IFileStorage storage, TimeProvider clock, IOptions<UploadOptions> options, ILogger<ScholarApplicationService> logger)
    {
        _db = db;
        _storage = storage;
        _clock = clock;
        _options = options.Value;
        _logger = logger;
    }

    /// <summary>Whether a user of <paramref name="role"/> may apply at all.</summary>
    public static bool RoleMayApply(UserRole role) => role is UserRole.Reader or UserRole.Author;

    public async Task<MyScholarApplicationDto> GetMineAsync(int userId, CancellationToken cancellationToken)
    {
        var role = await RoleOfAsync(userId, cancellationToken);
        var latest = await _db.ScholarApplications.AsNoTracking()
            .Include(application => application.Documents).ThenInclude(document => document.StoredFile)
            .Where(application => application.UserId == userId)
            .OrderByDescending(application => application.SubmittedAt).ThenByDescending(application => application.Id)
            .FirstOrDefaultAsync(cancellationToken);
        var canApply = RoleMayApply(role) && latest?.Status != ScholarApplicationStatus.Pending;
        return new MyScholarApplicationDto(canApply, latest is null ? null : ToDto(latest));
    }

    public async Task<ScholarApplicationDto> SubmitAsync(
        int userId, ScholarApplicationInput input, IReadOnlyList<ScholarDocumentUpload> documents, CancellationToken cancellationToken)
    {
        var degree = Required(input.Degree, ScholarApplication.DegreeMaxLength,
            AppErrors.ScholarApplicationDegreeRequired, AppErrors.ScholarApplicationDegreeTooLong);
        var institution = Required(input.Institution, ScholarApplication.InstitutionMaxLength,
            AppErrors.ScholarApplicationInstitutionRequired, AppErrors.ScholarApplicationInstitutionTooLong);
        var specialization = Required(input.Specialization, ScholarApplication.SpecializationMaxLength,
            AppErrors.ScholarApplicationSpecializationRequired, AppErrors.ScholarApplicationSpecializationTooLong);
        var mazhab = await MazhabAsync(input.Mazhab, cancellationToken);
        if (documents.Count == 0)
        {
            throw new ValidationException(AppErrors.ScholarApplicationDocumentsRequired);
        }

        if (documents.Count > ScholarApplication.MaxDocuments)
        {
            throw new ValidationException(AppErrors.ScholarApplicationDocumentsTooMany(ScholarApplication.MaxDocuments));
        }

        await EnsureMayApplyAsync(userId, cancellationToken);

        // Every file is checked before any is stored, so a refused application leaves nothing behind.
        var processed = new List<(ProcessedDocument Document, string FileName)>(documents.Count);
        foreach (var upload in documents)
        {
            var bytes = await ReadAtMostAsync(upload.Content, _options.MaxBytes, cancellationToken);
            var document = ScholarDocumentProcessor.Process(bytes, _options.MaxPixels);
            processed.Add((document, DisplayFileName(upload.FileName, document.Extension)));
        }

        var now = _clock.GetUtcNow().UtcDateTime;
        var application = new ScholarApplication
        {
            UserId = userId,
            Degree = degree,
            Institution = institution,
            Specialization = specialization,
            Mazhab = mazhab,
            Status = ScholarApplicationStatus.Pending,
            SubmittedAt = now,
        };
        var storedNames = new List<string>(processed.Count);
        try
        {
            foreach (var (document, fileName) in processed)
            {
                var name = StoredFileNames.CreatePrivate(document.Extension);
                await _storage.SaveAsync(name, document.Content, document.ContentType, cancellationToken);
                storedNames.Add(name);
                application.Documents.Add(new ScholarApplicationDocument
                {
                    Order = application.Documents.Count,
                    FileName = fileName,
                    StoredFile = new StoredFile
                    {
                        Name = name,
                        Purpose = StoredFilePurpose.ScholarDocument,
                        ContentType = document.ContentType,
                        SizeBytes = document.Content.Length,
                        Width = document.Width,
                        Height = document.Height,
                        UploadedById = userId,
                        UploadedAt = now,
                    },
                });
            }

            _db.ScholarApplications.Add(application);
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception exception)
        {
            // Files without their application would be personal data nothing points to: they go again.
            foreach (var name in storedNames)
            {
                await _storage.DeleteAsync(name, CancellationToken.None);
            }

            // The filtered unique index: another pending application of this user won a race.
            if (exception is DbUpdateException)
            {
                throw new ConflictException(AppErrors.ScholarApplicationAlreadyPending);
            }

            throw;
        }

        return ToDto(application);
    }

    /// <summary>Takes back the user's pending application and deletes its documents from the storage.</summary>
    public async Task<MyScholarApplicationDto> WithdrawAsync(int userId, CancellationToken cancellationToken)
    {
        var application = await _db.ScholarApplications
            .Include(candidate => candidate.Documents).ThenInclude(document => document.StoredFile)
            .FirstOrDefaultAsync(candidate => candidate.UserId == userId && candidate.Status == ScholarApplicationStatus.Pending, cancellationToken)
            ?? throw new NotFoundException(AppErrors.ScholarApplicationNotFound);

        var files = DetachDocuments(_db, application);
        application.Status = ScholarApplicationStatus.Withdrawn;
        application.ClosedAt = _clock.GetUtcNow().UtcDateTime;
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            // An admin decided first (V-02, #118): the decision stands and no file is touched.
            throw new ConflictException(AppErrors.ScholarApplicationNotPending);
        }

        await DeleteDetachedFilesAsync(_db, _storage, _clock, _logger, files);
        return await GetMineAsync(userId, cancellationToken);
    }

    /// <summary>
    /// A document for its applicant or an admin. Anyone else gets the same 404 as for a document
    /// that does not exist, so ids cannot be probed.
    /// </summary>
    public async Task<ScholarDocumentFile> OpenDocumentAsync(int documentId, int callerId, CancellationToken cancellationToken)
    {
        var document = await _db.ScholarApplicationDocuments.AsNoTracking()
            .Where(candidate => candidate.Id == documentId)
            .Select(candidate => new
            {
                candidate.Application.UserId,
                candidate.FileName,
                candidate.StoredFile.Name,
                candidate.StoredFile.ContentType,
                candidate.StoredFile.DeletedAt,
            })
            .FirstOrDefaultAsync(cancellationToken);
        if (document is null || document.DeletedAt is not null
            || (document.UserId != callerId && await RoleOfAsync(callerId, cancellationToken) != UserRole.Admin))
        {
            throw new NotFoundException(AppErrors.ScholarDocumentNotFound);
        }

        var stream = await _storage.OpenReadAsync(document.Name, cancellationToken)
            ?? throw new NotFoundException(AppErrors.ScholarDocumentNotFound);
        return new ScholarDocumentFile(stream, document.ContentType, document.FileName);
    }

    /// <summary>
    /// Removes the application's document rows (saved by the caller together with the new status) and
    /// gives back their stored files, to be deleted by <see cref="DeleteDetachedFilesAsync"/> once that
    /// save has succeeded.
    /// </summary>
    internal static List<StoredFile> DetachDocuments(MktbaDbContext db, ScholarApplication application)
    {
        var files = application.Documents.Select(document => document.StoredFile).ToList();
        db.ScholarApplicationDocuments.RemoveRange(application.Documents);
        application.Documents.Clear();
        return files;
    }

    /// <summary>
    /// Deletes the files of documents a successful save has just detached (a withdrawal, a refusal, a
    /// revocation) and marks them <see cref="StoredFile.DeletedAt"/>. It runs only after that save, so
    /// a save that loses a race (the <see cref="ScholarApplication.Status"/> concurrency token) leaves
    /// every file in place. A file that cannot be deleted now is logged and left unmarked: no document
    /// row points to it any more, so the upload cleanup removes it on its next run.
    /// </summary>
    internal static async Task DeleteDetachedFilesAsync(
        MktbaDbContext db, IFileStorage storage, TimeProvider clock, ILogger logger, IReadOnlyList<StoredFile> files)
    {
        var marked = false;
        foreach (var file in files)
        {
            try
            {
                // Not cancelled with the request: the decision is stored, the files must follow it.
                await storage.DeleteAsync(file.Name, CancellationToken.None);
                file.DeletedAt = clock.GetUtcNow().UtcDateTime;
                marked = true;
            }
            catch (Exception exception)
            {
                logger.LogWarning(exception, "Could not delete scholar document file {FileId}; the upload cleanup will remove it.", file.Id);
            }
        }

        if (!marked)
        {
            return;
        }

        try
        {
            await db.SaveChangesAsync(CancellationToken.None);
        }
        catch (DbUpdateException exception)
        {
            // The files are gone; the cleanup finds the unmarked rows and marks them (deleting again is a no-op).
            logger.LogWarning(exception, "Could not mark {Count} deleted scholar document file(s); the upload cleanup will.", files.Count);
        }
    }

    private async Task EnsureMayApplyAsync(int userId, CancellationToken cancellationToken)
    {
        if (!RoleMayApply(await RoleOfAsync(userId, cancellationToken)))
        {
            throw new ConflictException(AppErrors.ScholarApplicationRoleNotAllowed);
        }

        if (await _db.ScholarApplications.AnyAsync(
                application => application.UserId == userId && application.Status == ScholarApplicationStatus.Pending, cancellationToken))
        {
            throw new ConflictException(AppErrors.ScholarApplicationAlreadyPending);
        }
    }

    private async Task<UserRole> RoleOfAsync(int userId, CancellationToken cancellationToken) =>
        await _db.Users.AsNoTracking().Where(user => user.Id == userId).Select(user => (UserRole?)user.Role)
            .FirstOrDefaultAsync(cancellationToken)
        ?? throw new NotFoundException(AppErrors.UserNotFound(userId));

    /// <summary>A system school's slug in lower case, or null for a blank value.</summary>
    private async Task<string?> MazhabAsync(string? value, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var slug = value.Trim().ToLowerInvariant();
        if (slug.Length > ScholarApplication.MazhabMaxLength
            || !await _db.Schools.AnyAsync(school => school.IsSystem && school.Slug == slug, cancellationToken))
        {
            throw new ValidationException(AppErrors.ScholarApplicationMazhabInvalid);
        }

        return slug;
    }

    /// <summary>A required one-line value: trimmed, every run of white space (line breaks included) made one space.</summary>
    private static string Required(string? value, int maxLength, AppError required, Func<int, AppError> tooLong)
    {
        var text = OneLine(value);
        if (text.Length == 0)
        {
            throw new ValidationException(required);
        }

        if (text.Length > maxLength)
        {
            throw new ValidationException(tooLong(maxLength));
        }

        return text;
    }

    private static string OneLine(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder(value.Length);
        var pendingSpace = false;
        foreach (var character in value.Trim())
        {
            if (char.IsWhiteSpace(character) || char.IsControl(character))
            {
                pendingSpace = true;
                continue;
            }

            if (pendingSpace)
            {
                builder.Append(' ');
                pendingSpace = false;
            }

            builder.Append(character);
        }

        return builder.ToString();
    }

    /// <summary>
    /// The uploaded file's own name without any path, on one line and shortened, with the extension
    /// of what is stored (a JPEG scan is kept as WebP); "document" when nothing usable is left.
    /// </summary>
    public static string DisplayFileName(string? fileName, string extension)
    {
        var withoutPath = Path.GetFileName((fileName ?? string.Empty).Replace('\\', '/'));
        var baseName = OneLine(Path.GetFileNameWithoutExtension(withoutPath));
        if (baseName.Length == 0)
        {
            baseName = "document";
        }

        var maxBase = ScholarApplicationDocument.FileNameMaxLength - extension.Length;
        if (baseName.Length > maxBase)
        {
            baseName = baseName[..maxBase].TrimEnd();
        }

        return baseName + extension;
    }

    internal static ScholarApplicationDto ToDto(ScholarApplication application) => new(
        application.Id,
        application.Status,
        application.Degree,
        application.Institution,
        application.Specialization,
        application.Mazhab,
        application.SubmittedAt,
        application.ClosedAt,
        application.Documents
            .OrderBy(document => document.Order)
            .Select(document => new ScholarDocumentDto(document.Id, document.FileName, document.StoredFile.ContentType, document.StoredFile.SizeBytes))
            .ToList(),
        application.DecisionReason,
        application.RevokedAt);

    /// <summary>The file to its end, refused as soon as it passes <paramref name="maxBytes"/>; an empty file is refused too.</summary>
    private static async Task<byte[]> ReadAtMostAsync(Stream content, long maxBytes, CancellationToken cancellationToken)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await content.ReadAsync(chunk, cancellationToken)) > 0)
        {
            if (buffer.Length + read > maxBytes)
            {
                throw new ValidationException(AppErrors.UploadTooLarge(ImageUploadService.MaxMegabytes(maxBytes)));
            }

            buffer.Write(chunk, 0, read);
        }

        if (buffer.Length == 0)
        {
            throw new ValidationException(AppErrors.UploadFileRequired);
        }

        return buffer.ToArray();
    }
}
