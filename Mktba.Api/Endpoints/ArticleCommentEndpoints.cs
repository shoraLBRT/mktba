using System.Security.Claims;
using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Comments;

namespace Mktba.Api.Endpoints;

/// <summary>
/// Readers' comments under a published article (C-01, #127): the public list, a new comment or a
/// reply, editing and deleting. Who may do what to which comment is decided by
/// <see cref="ArticleCommentService"/>; every write is under the per-IP limit <c>RateLimiting:Comments</c>.
/// </summary>
public static class ArticleCommentEndpoints
{
    public static IEndpointRouteBuilder MapArticleCommentEndpoints(this IEndpointRouteBuilder builder)
    {
        builder.MapGet("/articles/{articleId:int}/comments", async (int articleId, int? page, int? pageSize, ClaimsPrincipal principal, ArticleCommentService service, CancellationToken cancellationToken) =>
                Results.Ok(await service.ListAsync(
                    articleId, principal.GetUserId(), page ?? 1, pageSize ?? ArticleCommentService.DefaultPageSize, cancellationToken)))
            .WithTags("ArticleComments")
            .WithSummary("A page of a published article's comments: top-level comments oldest first, each with its whole reply tree, flat.")
            .WithDescription(
                "Public; with a token the items say what the caller may do (isMine, canEdit, canDelete) and viewer whether they may "
                + "comment. page from 1, pageSize 1 to 50 (20 by default) top-level comments. No emails or user ids. "
                + "404 article_not_found for an article readers are not served.")
            .Produces<ArticleCommentPageDto>()
            .ProducesApiProblem(StatusCodes.Status404NotFound);

        builder.MapPost("/articles/{articleId:int}/comments", async (int articleId, ArticleCommentCreateDto dto, ClaimsPrincipal principal, ArticleCommentService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.CreateAsync(articleId, userId, dto, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithTags("ArticleComments")
            .RequireAuthorization(Policies.Authenticated)
            .RequireRateLimiting(RateLimitingSetup.CommentsPolicy)
            .WithSummary("A new comment on a published article, or a reply (parentId) to one of its comments.")
            .WithDescription(
                "400 comment_body_required or comment_body_too_long (params.maxLength); 404 article_not_found or comment_not_found "
                + "(the parent); 403 comment_banned (params.until); 409 email_not_confirmed, comment_display_name_required, "
                + "comment_deleted or comment_hidden (the parent). The answer's isPending says it is held for a moderator; "
                + "429 comment_limit_reached (the account's limit) or too_many_requests (the address's).")
            .Produces<ArticleCommentDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status401Unauthorized, StatusCodes.Status403Forbidden, StatusCodes.Status404NotFound, StatusCodes.Status409Conflict, StatusCodes.Status429TooManyRequests);

        var comments = builder.MapGroup("/comments").WithTags("ArticleComments");

        comments.MapPut("/{id:int}", async (int id, ArticleCommentUpdateDto dto, ClaimsPrincipal principal, ArticleCommentService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.UpdateAsync(id, userId, dto, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .RequireAuthorization(Policies.Authenticated)
            .RequireRateLimiting(RateLimitingSetup.CommentsPolicy)
            .WithSummary("The new text of the caller's own comment.")
            .WithDescription(
                "400 comment_body_required or comment_body_too_long; 403 forbidden (someone else's) or comment_banned; "
                + "404 comment_not_found; 409 comment_deleted or comment_hidden. An edit the spam filter catches holds the comment again.")
            .Produces<ArticleCommentDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status401Unauthorized, StatusCodes.Status403Forbidden, StatusCodes.Status404NotFound, StatusCodes.Status409Conflict, StatusCodes.Status429TooManyRequests);

        comments.MapDelete("/{id:int}", async (int id, ClaimsPrincipal principal, ArticleCommentService service, CancellationToken cancellationToken) =>
            {
                if (principal.GetUserId() is not int userId)
                {
                    return ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized);
                }

                await service.DeleteAsync(id, userId, cancellationToken);
                return Results.NoContent();
            })
            .RequireAuthorization(Policies.Authenticated)
            .RequireRateLimiting(RateLimitingSetup.CommentsPolicy)
            .WithSummary("Deletes a comment softly: its author, or an admin any. The text is erased, replies stay («комментарий удалён»).")
            .WithDescription("204 also for a comment already deleted. 403 forbidden; 404 comment_not_found.")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesApiProblem(StatusCodes.Status401Unauthorized, StatusCodes.Status403Forbidden, StatusCodes.Status404NotFound, StatusCodes.Status429TooManyRequests);

        comments.MapPost("/{id:int}/reports", async (int id, ArticleCommentReportCreateDto dto, ClaimsPrincipal principal, ArticleCommentService service, CancellationToken cancellationToken) =>
            {
                if (principal.GetUserId() is not int userId)
                {
                    return ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized);
                }

                await service.ReportAsync(id, userId, dto, cancellationToken);
                return Results.NoContent();
            })
            .RequireAuthorization(Policies.Authenticated)
            .RequireRateLimiting(RateLimitingSetup.CommentsPolicy)
            .WithSummary("Reports someone else's published comment (C-02), once per reader; enough reports hold it for a moderator.")
            .WithDescription(
                "400 comment_report_reason_required or comment_report_note_too_long (params.maxLength); 403 forbidden (one's own); "
                + "404 comment_not_found; 409 email_not_confirmed, comment_deleted, comment_hidden or comment_already_reported.")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status401Unauthorized, StatusCodes.Status403Forbidden, StatusCodes.Status404NotFound, StatusCodes.Status409Conflict, StatusCodes.Status429TooManyRequests);

        // Moderation (C-02, #128): the queues, the decisions and the bans.
        var moderation = comments.MapGroup(string.Empty).RequireAuthorization(Policies.CanModerateComments);

        moderation.MapGet("/moderation", async (CommentModerationQueue? queue, int? page, int? pageSize, CommentModerationService service, CancellationToken cancellationToken) =>
                Results.Ok(await service.QueueAsync(
                    queue ?? CommentModerationQueue.Pending, page ?? 1, pageSize ?? CommentModerationService.DefaultPageSize, cancellationToken)))
            .WithSummary("A page of a moderation queue: comments held for a moderator, reported, or hidden; with every queue's count.")
            .WithDescription("queue Pending (default), Reported or Hidden; page from 1, pageSize 1 to 100 (20 by default). Authors' emails included.")
            .Produces<CommentModerationPageDto>()
            .ProducesApiProblem(StatusCodes.Status401Unauthorized, StatusCodes.Status403Forbidden);

        moderation.MapPost("/{id:int}/moderation", async (int id, CommentModerationDto dto, ClaimsPrincipal principal, CommentModerationService service, CancellationToken cancellationToken) =>
            {
                if (principal.GetUserId() is not int userId)
                {
                    return ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized);
                }

                await service.ModerateAsync(id, userId, dto, cancellationToken);
                return Results.NoContent();
            })
            .WithSummary("Approves (publishes, settling the reports so far) or hides a comment.")
            .WithDescription("400 comment_moderation_action_required; 404 comment_not_found; 409 comment_deleted.")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status401Unauthorized, StatusCodes.Status403Forbidden, StatusCodes.Status404NotFound, StatusCodes.Status409Conflict);

        moderation.MapGet("/bans", async (CommentModerationService service, CancellationToken cancellationToken) =>
                Results.Ok(await service.ListBansAsync(cancellationToken)))
            .WithSummary("The users barred from commenting now, the newest ban first.")
            .Produces<IReadOnlyList<CommentBanDto>>()
            .ProducesApiProblem(StatusCodes.Status401Unauthorized, StatusCodes.Status403Forbidden);

        moderation.MapPut("/bans/{userId:int}", async (int userId, CommentBanCreateDto dto, ClaimsPrincipal principal, CommentModerationService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int moderatorId
                    ? Results.Ok(await service.BanAsync(userId, moderatorId, dto, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithSummary("Bars a user from writing and editing comments for days, or for good (days null); replaces their current ban.")
            .WithDescription("400 comment_ban_days_invalid (params.maxDays) or comment_ban_reason_too_long; 404 user_not_found; 409 comment_ban_admin.")
            .Produces<CommentBanDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status401Unauthorized, StatusCodes.Status403Forbidden, StatusCodes.Status404NotFound, StatusCodes.Status409Conflict);

        moderation.MapDelete("/bans/{userId:int}", async (int userId, CommentModerationService service, CancellationToken cancellationToken) =>
            {
                await service.UnbanAsync(userId, cancellationToken);
                return Results.NoContent();
            })
            .WithSummary("Lifts a user's comment ban; 204 also when there is none.")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesApiProblem(StatusCodes.Status401Unauthorized, StatusCodes.Status403Forbidden);

        return builder;
    }
}
