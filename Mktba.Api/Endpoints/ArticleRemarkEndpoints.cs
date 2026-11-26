using System.Security.Claims;
using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Verification;

namespace Mktba.Api.Endpoints;

/// <summary>
/// Scholars' remarks on a block of an article (V-06, #122): the remarks the caller may see, a new
/// remark, replies, closing and reopening. Private to the scholar, the article's authors and the
/// editors; who may do what to which remark is decided by <see cref="ArticleRemarkService"/>.
/// </summary>
public static class ArticleRemarkEndpoints
{
    public static IEndpointRouteBuilder MapArticleRemarkEndpoints(this IEndpointRouteBuilder builder)
    {
        builder.MapGet("/articles/{articleId:int}/remarks", async (int articleId, ClaimsPrincipal principal, ArticleRemarkService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.ListAsync(articleId, userId, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithTags("ArticleRemarks")
            .RequireAuthorization(Policies.Authenticated)
            .WithSummary("The remarks on an article the caller may see: all for its authors and the editors, their own for a scholar; open first.")
            .WithDescription("404 article_not_found also when the caller has no part in the article's remarks.")
            .Produces<ArticleRemarkListDto>()
            .ProducesApiProblem(StatusCodes.Status401Unauthorized, StatusCodes.Status404NotFound);

        builder.MapPost("/articles/{articleId:int}/remarks", async (int articleId, ArticleRemarkCreateDto dto, ClaimsPrincipal principal, ArticleRemarkService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.CreateAsync(articleId, userId, dto, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithTags("ArticleRemarks")
            .RequireAuthorization(Policies.CanVerify)
            .WithSummary("A verified scholar's remark on a paragraph, or on one opinion of a block, of the article's latest revision.")
            .WithDescription(
                "Logged as ArticleRemarkCreated. 400 article_remark_body_required, article_remark_body_too_long (params.maxLength) or "
                + "article_remark_block_invalid; 404 article_not_found (not published, in the trash, or without a revision); "
                + "409 article_review_not_verified_scholar or article_review_revision_outdated (params.latest).")
            .Produces<ArticleRemarkDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status401Unauthorized, StatusCodes.Status404NotFound, StatusCodes.Status409Conflict);

        var remarks = builder.MapGroup("/article-remarks").WithTags("ArticleRemarks");

        remarks.MapGet("/mine", async (bool? open, int? page, int? pageSize, ClaimsPrincipal principal, ArticleRemarkService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.ListMineAsync(userId, open, page ?? 1, pageSize ?? ArticleRemarkService.DefaultPageSize, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .RequireAuthorization(Policies.CanVerify)
            .WithSummary("The caller's own remarks across articles, the latest changed first (the scholar's cabinet).")
            .WithDescription("open=true keeps the open remarks, open=false the closed ones; page from 1, pageSize 1 to 100 (20 by default). A trashed article's remarks are left out.")
            .Produces<ScholarRemarkHistoryPageDto>()
            .ProducesApiProblem(StatusCodes.Status401Unauthorized);

        remarks.MapPost("/{id:int}/messages", async (int id, ArticleRemarkReplyDto dto, ClaimsPrincipal principal, ArticleRemarkService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.ReplyAsync(id, userId, dto, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .RequireAuthorization(Policies.Authenticated)
            .WithSummary("A reply in an open remark's thread: its scholar, the article's authors or an editor.")
            .WithDescription(
                "400 article_remark_body_required or article_remark_body_too_long; 404 article_remark_not_found (also when the caller "
                + "has no part in it); 409 article_remark_closed or article_review_not_verified_scholar.")
            .Produces<ArticleRemarkDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status401Unauthorized, StatusCodes.Status404NotFound, StatusCodes.Status409Conflict);

        remarks.MapPost("/{id:int}/close", async (int id, ArticleRemarkCloseDto dto, ClaimsPrincipal principal, ArticleRemarkService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.CloseAsync(id, userId, dto, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .RequireAuthorization(Policies.CanEditArticles)
            .WithSummary("The article's authors or an editor close an open remark: Resolved (fixed) or Closed (no change), with an optional last message.")
            .WithDescription(
                "Logged as ArticleRemarkClosed (to: the outcome). 400 article_remark_outcome_invalid or article_remark_body_too_long; "
                + "403 forbidden; 404 article_remark_not_found; 409 article_remark_closed.")
            .Produces<ArticleRemarkDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status401Unauthorized, StatusCodes.Status403Forbidden, StatusCodes.Status404NotFound, StatusCodes.Status409Conflict);

        remarks.MapPost("/{id:int}/reopen", async (int id, ArticleRemarkReopenDto dto, ClaimsPrincipal principal, ArticleRemarkService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.ReopenAsync(id, userId, dto, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .RequireAuthorization(Policies.CanVerify)
            .WithSummary("The remark's scholar or an editor reopen a closed remark, with an optional message.")
            .WithDescription(
                "Logged as ArticleRemarkReopened (from: how it had been closed). 400 article_remark_body_too_long; 403 forbidden; "
                + "404 article_remark_not_found; 409 article_remark_open or article_review_not_verified_scholar.")
            .Produces<ArticleRemarkDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status401Unauthorized, StatusCodes.Status403Forbidden, StatusCodes.Status404NotFound, StatusCodes.Status409Conflict);

        return builder;
    }
}
