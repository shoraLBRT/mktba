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
/// <param name="Documents">The attached documents in their order; empty once a withdrawal deleted them.</param>
public sealed record ScholarApplicationDto(
    int Id,
    ScholarApplicationStatus Status,
    string Degree,
    string Institution,
    string Specialization,
    string? Mazhab,
    DateTime SubmittedAt,
    DateTime? ClosedAt,
    IReadOnlyList<ScholarDocumentDto> Documents);

/// <summary>
/// One attached document. It is read through <c>GET /scholar-application/documents/{id}</c> by its
/// applicant or an admin only; it has no public address.
/// </summary>
/// <param name="FileName">The name the uploaded file had.</param>
/// <param name="ContentType">application/pdf, or image/webp for a photo or scan (images are re-encoded).</param>
public sealed record ScholarDocumentDto(int Id, string FileName, string ContentType, long SizeBytes);
