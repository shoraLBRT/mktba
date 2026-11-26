using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs;

/// <summary>
/// The signed-in user's side of the scholar status (V-01, #117): whether they may apply now and
/// their latest application, if any.
/// </summary>
/// <param name="CanApply">True for a reader or an author without a pending application.</param>
/// <param name="Application">The newest application, whatever its status; null when there is none.</param>
public sealed record MyScholarApplicationDto(bool CanApply, ScholarApplicationDto? Application);

/// <summary>One application for the scholar status, as its applicant (or an admin) sees it.</summary>
/// <param name="Mazhab">The slug of a canonical school (hanafi, maliki, shafii, hanbali); null when none was named.</param>
/// <param name="ClosedAt">When it was withdrawn or decided; null while pending.</param>
/// <param name="Documents">
/// The attached documents in their order; empty once a withdrawal, a refusal or a revocation deleted
/// them (V-02, #118: an approved application keeps them).
/// </param>
/// <param name="DecisionReason">The admin's reason for a refusal or a revocation (plain text); null otherwise.</param>
/// <param name="RevokedAt">When the scholar status this application granted was revoked; null otherwise.</param>
public sealed record ScholarApplicationDto(
    int Id,
    ScholarApplicationStatus Status,
    string Degree,
    string Institution,
    string Specialization,
    string? Mazhab,
    DateTime SubmittedAt,
    DateTime? ClosedAt,
    IReadOnlyList<ScholarDocumentDto> Documents,
    string? DecisionReason,
    DateTime? RevokedAt);

/// <summary>The applicant as an admin sees them (V-02, #118): who they are now and their current role.</summary>
public sealed record ScholarApplicantDto(int Id, string Email, string? DisplayName, UserRole Role);

/// <summary>One line of the admin's list of applications (V-02, #118).</summary>
public sealed record ScholarApplicationSummaryDto(
    int Id,
    ScholarApplicationStatus Status,
    ScholarApplicantDto Applicant,
    string Degree,
    string Institution,
    string Specialization,
    DateTime SubmittedAt,
    DateTime? ClosedAt,
    int DocumentCount);

/// <summary>One page of the admin's list of applications, newest first.</summary>
public sealed record ScholarApplicationPageDto(IReadOnlyList<ScholarApplicationSummaryDto> Items, int Total, int Page, int PageSize);

/// <summary>
/// One application for the admin's review (V-02, #118): the applicant and the application with its
/// documents (read through <c>GET /scholar-application/documents/{id}</c>).
/// </summary>
/// <param name="CanApprove">Pending, and the applicant is still a reader or an author.</param>
/// <param name="CanReject">Pending.</param>
/// <param name="CanRevoke">Approved, and the applicant still has the scholar role.</param>
public sealed record ScholarApplicationReviewDto(
    ScholarApplicantDto Applicant,
    ScholarApplicationDto Application,
    bool CanApprove,
    bool CanReject,
    bool CanRevoke);

/// <summary>The admin's reason for a refusal or a revocation; required, plain text, shown to the applicant.</summary>
public sealed record ScholarDecisionDto(string? Reason);

/// <summary>
/// One attached document. It is read through <c>GET /scholar-application/documents/{id}</c> by its
/// applicant or an admin only; it has no public address.
/// </summary>
/// <param name="FileName">The name the uploaded file had.</param>
/// <param name="ContentType">application/pdf, or image/webp for a photo or scan (images are re-encoded).</param>
public sealed record ScholarDocumentDto(int Id, string FileName, string ContentType, long SizeBytes);
