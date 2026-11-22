using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Services;
using Mktba.Domain.Entities;

namespace Mktba.Api.Endpoints;

public static class AuditLogEndpoints
{
    public static IEndpointRouteBuilder MapAuditLogEndpoints(this IEndpointRouteBuilder builder)
    {
        builder.MapGet("/audit-log", async (
                AuditAction? action,
                int? actorId,
                int? articleId,
                int? targetUserId,
                int? page,
                int? pageSize,
                AuditLogService service,
                CancellationToken cancellationToken) =>
                Results.Ok(await service.GetPageAsync(
                    action, actorId, articleId, targetUserId, page ?? 1, pageSize ?? AuditLogService.DefaultPageSize, cancellationToken)))
            .WithTags("AuditLog")
            .WithSummary("The audit log (U-09, #135): who changed what and when, newest first. Admin only.")
            .WithDescription(
                "Logged actions: ArticleStatusChanged (publication included; fromValue/toValue are statuses), "
                + "ArticleTrashed, ArticleRestored, ArticlePurged, UserRoleChanged (fromValue/toValue are roles). "
                + "Filters: action, actorId, articleId, targetUserId. page from 1, pageSize 1 to 100 (50 by default). "
                + "Each entry is written in the same save as its action and is never changed or removed. "
                + "Only the acting user's id and the ids of the article or user acted on are kept, with the "
                + "article's title at the time; no IP address, no User-Agent.")
            .Produces<AuditLogPageDto>()
            .RequireAuthorization(Policies.CanViewAuditLog);

        return builder;
    }
}
