using System.Security.Claims;
using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Verification;
using Mktba.Domain.Entities;

namespace Mktba.Api.Endpoints;

/// <summary>
/// The admin's review of scholar applications (V-02, #118): the list, one application, approval,
/// refusal and revocation. The documents are read through <c>GET /scholar-application/documents/{id}</c>.
/// </summary>
public static class ScholarApplicationReviewEndpoints
{
    private const string ReasonErrors =
        "400 scholar_decision_reason_required or scholar_decision_reason_too_long (params.maxLength); ";

    public static IEndpointRouteBuilder MapScholarApplicationReviewEndpoints(this IEndpointRouteBuilder builder)
    {
        var group = builder.MapGroup("/scholar-applications")
            .WithTags("ScholarApplicationReview")
            .RequireAuthorization(Policies.CanManageUsers);

        group.MapGet("/", async (ScholarApplicationStatus? status, int? page, int? pageSize, ScholarApplicationReviewService service, CancellationToken cancellationToken) =>
                Results.Ok(await service.ListAsync(status, page ?? 1, pageSize ?? ScholarApplicationReviewService.DefaultPageSize, cancellationToken)))
            .WithSummary("Scholar applications for review, newest first; admins only.")
            .WithDescription("Filter: status (Pending, Approved, Rejected, Withdrawn, Revoked). page from 1, pageSize 1 to 100 (20 by default).")
            .Produces<ScholarApplicationPageDto>();

        group.MapGet("/{id:int}", async (int id, ScholarApplicationReviewService service, CancellationToken cancellationToken) =>
                Results.Ok(await service.GetAsync(id, cancellationToken)))
            .WithSummary("One application with its applicant and documents, and which decisions are open.")
            .WithDescription("404 scholar_application_not_found.")
            .Produces<ScholarApplicationReviewDto>()
            .ProducesApiProblem(StatusCodes.Status404NotFound);

        group.MapPost("/{id:int}/approve", async (int id, ClaimsPrincipal principal, ScholarApplicationReviewService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int adminId
                    ? Results.Ok(await service.ApproveAsync(id, adminId, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithSummary("Approves a pending application: the applicant gets the Scholar role from their next request.")
            .WithDescription(
                "The role change is logged as UserRoleChanged and the decision as ScholarApplicationApproved. The documents are kept. "
                + "404 scholar_application_not_found; 409 scholar_application_not_pending or scholar_applicant_role_changed "
                + "(the applicant is no longer a reader or an author).")
            .Produces<ScholarApplicationReviewDto>()
            .ProducesApiProblem(StatusCodes.Status401Unauthorized, StatusCodes.Status404NotFound, StatusCodes.Status409Conflict);

        group.MapPost("/{id:int}/reject", async (int id, ScholarDecisionDto dto, ClaimsPrincipal principal, ScholarApplicationReviewService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int adminId
                    ? Results.Ok(await service.RejectAsync(id, dto.Reason, adminId, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithSummary("Refuses a pending application with a reason the applicant sees; its documents are deleted.")
            .WithDescription(
                "Logged as ScholarApplicationRejected. The user may apply again. "
                + ReasonErrors + "404 scholar_application_not_found; 409 scholar_application_not_pending.")
            .Produces<ScholarApplicationReviewDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status401Unauthorized, StatusCodes.Status404NotFound, StatusCodes.Status409Conflict);

        group.MapPost("/{id:int}/revoke", async (int id, ScholarDecisionDto dto, ClaimsPrincipal principal, ScholarApplicationReviewService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int adminId
                    ? Results.Ok(await service.RevokeAsync(id, dto.Reason, adminId, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithSummary("Takes back the scholar status an approved application gave, with a reason the applicant sees.")
            .WithDescription(
                "The user gets back the role they had before the approval (UserRoleChanged + ScholarStatusRevoked in the log); "
                + "the documents are deleted; the user may apply again. "
                + ReasonErrors + "404 scholar_application_not_found; 409 scholar_application_not_approved or "
                + "scholar_applicant_role_changed (the user is no longer a scholar).")
            .Produces<ScholarApplicationReviewDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status401Unauthorized, StatusCodes.Status404NotFound, StatusCodes.Status409Conflict);

        return builder;
    }
}
