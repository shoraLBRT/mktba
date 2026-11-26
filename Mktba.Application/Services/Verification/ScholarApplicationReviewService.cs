using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;
using Mktba.Infrastructure.Storage;

namespace Mktba.Application.Services.Verification;

/// <summary>
/// The admin's review of scholar applications (V-02, #118): the list, one application with its
/// documents, approval, refusal with a reason and revocation of the status an approval gave.
/// </summary>
/// <remarks>
/// <para>
/// An approval gives the applicant the <see cref="UserRole.Scholar"/> role through
/// <see cref="UserAdminService.ChangeRoleAsync"/>, the same path as the users page, so the audit log
/// gets its <see cref="AuditAction.UserRoleChanged"/> entry; the decision itself is a
/// <see cref="AuditAction.ScholarApplicationApproved"/> entry in the same save. A revocation gives
/// back the role the applicant had before the approval.
/// </para>
/// <para>
/// Defaults chosen by the agent, open for the owner in #118: only an applicant who is still a reader
/// or an author is approved (a role changed by hand in between is left to the users page); a refusal
/// and a revocation need a reason the applicant sees; a refused or revoked application's documents
/// are deleted right after the decision is saved (never before: a decision that loses a race leaves
/// them in place), an approved one keeps them for the admins (until a revocation); after a
/// refusal or a revocation the user may apply again. The profile's self-declared degree and
/// institution are not touched.
/// </para>
/// </remarks>
public sealed class ScholarApplicationReviewService
{
    /// <summary>The page size when the request gives none.</summary>
    public const int DefaultPageSize = 20;

    /// <summary>The largest page of the list.</summary>
    public const int MaxPageSize = 100;

    private readonly MktbaDbContext _db;
    private readonly IFileStorage _storage;
    private readonly TimeProvider _clock;
    private readonly UserAdminService _userAdmin;
    private readonly AuditLogRepository _auditLog;
    private readonly ILogger<ScholarApplicationReviewService> _logger;

    public ScholarApplicationReviewService(
        MktbaDbContext db,
        IFileStorage storage,
        TimeProvider clock,
        UserAdminService userAdmin,
        AuditLogRepository auditLog,
        ILogger<ScholarApplicationReviewService> logger)
    {
        _logger = logger;
        _db = db;
        _storage = storage;
        _clock = clock;
        _userAdmin = userAdmin;
        _auditLog = auditLog;
    }

    /// <summary>
    /// One page of the applications, newest first, optionally of one status. A page below 1 is the
    /// first, the page size is kept within 1 to <see cref="MaxPageSize"/>; a page past the end is empty.
    /// </summary>
    public async Task<ScholarApplicationPageDto> ListAsync(
        ScholarApplicationStatus? status, int page, int pageSize, CancellationToken cancellationToken)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);
        var query = _db.ScholarApplications.AsNoTracking();
        if (status is { } wanted)
        {
            query = query.Where(application => application.Status == wanted);
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(application => application.SubmittedAt).ThenByDescending(application => application.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(application => new ScholarApplicationSummaryDto(
                application.Id,
                application.Status,
                new ScholarApplicantDto(application.User.Id, application.User.Email, application.User.DisplayName, application.User.Role),
                application.Degree,
                application.Institution,
                application.Specialization,
                application.SubmittedAt,
                application.ClosedAt,
                application.Documents.Count))
            .ToListAsync(cancellationToken);
        return new ScholarApplicationPageDto(items, total, page, pageSize);
    }

    public async Task<ScholarApplicationReviewDto> GetAsync(int id, CancellationToken cancellationToken) =>
        ToReview(await LoadAsync(id, tracked: false, cancellationToken));

    /// <summary>Approves a pending application: the applicant becomes a scholar from their next request.</summary>
    public async Task<ScholarApplicationReviewDto> ApproveAsync(int id, int adminId, CancellationToken cancellationToken)
    {
        var application = await LoadAsync(id, tracked: true, cancellationToken);
        EnsurePending(application);
        if (!ScholarApplicationService.RoleMayApply(application.User.Role))
        {
            throw new ConflictException(AppErrors.ScholarApplicantRoleChanged);
        }

        var now = _clock.GetUtcNow().UtcDateTime;
        application.Status = ScholarApplicationStatus.Approved;
        application.ClosedAt = now;
        application.RoleBeforeApproval = application.User.Role;
        _auditLog.Add(Entry(AuditAction.ScholarApplicationApproved, adminId, application.UserId, now));
        // The role change saves the context, so the decision, its entry and the role go together.
        await SaveThroughRoleChangeAsync(application.UserId, UserRole.Scholar, adminId, cancellationToken);
        return ToReview(application);
    }

    /// <summary>Refuses a pending application with a reason the applicant sees, and deletes its documents.</summary>
    public async Task<ScholarApplicationReviewDto> RejectAsync(int id, string? reason, int adminId, CancellationToken cancellationToken)
    {
        var text = Reason(reason);
        var application = await LoadAsync(id, tracked: true, cancellationToken);
        EnsurePending(application);

        var now = _clock.GetUtcNow().UtcDateTime;
        var files = ScholarApplicationService.DetachDocuments(_db, application);
        application.Status = ScholarApplicationStatus.Rejected;
        application.ClosedAt = now;
        application.DecisionReason = text;
        _auditLog.Add(Entry(AuditAction.ScholarApplicationRejected, adminId, application.UserId, now));
        await SaveAsync(AppErrors.ScholarApplicationNotPending, cancellationToken);
        await ScholarApplicationService.DeleteDetachedFilesAsync(_db, _storage, _clock, _logger, files);
        return ToReview(application);
    }

    /// <summary>
    /// Takes back the scholar status an approved application gave: the user gets back the role they
    /// had before the approval, the reason is shown to them, and the documents are deleted.
    /// </summary>
    public async Task<ScholarApplicationReviewDto> RevokeAsync(int id, string? reason, int adminId, CancellationToken cancellationToken)
    {
        var text = Reason(reason);
        var application = await LoadAsync(id, tracked: true, cancellationToken);
        if (application.Status != ScholarApplicationStatus.Approved)
        {
            throw new ConflictException(AppErrors.ScholarApplicationNotApproved);
        }

        if (application.User.Role != UserRole.Scholar)
        {
            throw new ConflictException(AppErrors.ScholarApplicantRoleChanged);
        }

        var now = _clock.GetUtcNow().UtcDateTime;
        var files = ScholarApplicationService.DetachDocuments(_db, application);
        application.Status = ScholarApplicationStatus.Revoked;
        application.RevokedAt = now;
        application.DecisionReason = text;
        _auditLog.Add(Entry(AuditAction.ScholarStatusRevoked, adminId, application.UserId, now));
        var role = application.RoleBeforeApproval is { } before && ScholarApplicationService.RoleMayApply(before)
            ? before
            : UserRole.Reader;
        await SaveThroughRoleChangeAsync(application.UserId, role, adminId, cancellationToken, AppErrors.ScholarApplicationNotApproved);
        await ScholarApplicationService.DeleteDetachedFilesAsync(_db, _storage, _clock, _logger, files);
        return ToReview(application);
    }

    private async Task<ScholarApplication> LoadAsync(int id, bool tracked, CancellationToken cancellationToken)
    {
        var query = _db.ScholarApplications
            .Include(application => application.User)
            .Include(application => application.Documents).ThenInclude(document => document.StoredFile)
            .AsQueryable();
        if (!tracked)
        {
            query = query.AsNoTracking();
        }

        return await query.FirstOrDefaultAsync(application => application.Id == id, cancellationToken)
            ?? throw new NotFoundException(AppErrors.ScholarApplicationNotFound);
    }

    private static void EnsurePending(ScholarApplication application)
    {
        if (application.Status != ScholarApplicationStatus.Pending)
        {
            throw new ConflictException(AppErrors.ScholarApplicationNotPending);
        }
    }

    private async Task SaveThroughRoleChangeAsync(
        int userId, UserRole role, int adminId, CancellationToken cancellationToken, AppError? raced = null)
    {
        try
        {
            await _userAdmin.ChangeRoleAsync(userId, role, adminId, cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException(raced ?? AppErrors.ScholarApplicationNotPending);
        }
    }

    private async Task SaveAsync(AppError raced, CancellationToken cancellationToken)
    {
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Another admin decided, or the applicant withdrew, first.
            throw new ConflictException(raced);
        }
    }

    /// <summary>A required plain-text reason: trimmed, line breaks kept, at most <see cref="ScholarApplication.ReasonMaxLength"/>.</summary>
    private static string Reason(string? reason)
    {
        var text = (reason ?? string.Empty).Replace("\r\n", "\n").Trim();
        if (text.Length == 0)
        {
            throw new ValidationException(AppErrors.ScholarDecisionReasonRequired);
        }

        if (text.Length > ScholarApplication.ReasonMaxLength)
        {
            throw new ValidationException(AppErrors.ScholarDecisionReasonTooLong(ScholarApplication.ReasonMaxLength));
        }

        return text;
    }

    private static AuditLogEntry Entry(AuditAction action, int adminId, int userId, DateTime now) => new()
    {
        OccurredAt = now,
        ActorId = adminId,
        Action = action,
        TargetUserId = userId,
    };

    private static ScholarApplicationReviewDto ToReview(ScholarApplication application)
    {
        var user = application.User;
        return new ScholarApplicationReviewDto(
            new ScholarApplicantDto(user.Id, user.Email, user.DisplayName, user.Role),
            ScholarApplicationService.ToDto(application),
            CanApprove: application.Status == ScholarApplicationStatus.Pending && ScholarApplicationService.RoleMayApply(user.Role),
            CanReject: application.Status == ScholarApplicationStatus.Pending,
            CanRevoke: application.Status == ScholarApplicationStatus.Approved && user.Role == UserRole.Scholar);
    }
}
