using System.Security.Claims;
using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Verification;

namespace Mktba.Api.Endpoints;

/// <summary>
/// A scholar's review of an article (V-03, #119): the published articles to review, one article's
/// latest revision with the caller's scope and reviews, and the verdict on that revision.
/// </summary>
public static class ArticleReviewEndpoints
{
    public static IEndpointRouteBuilder MapArticleReviewEndpoints(this IEndpointRouteBuilder builder)
    {
        var group = builder.MapGroup("/article-reviews")
            .WithTags("ArticleReviews")
            .RequireAuthorization(Policies.CanVerify);

        group.MapGet("/", async (string? q, int? page, int? pageSize, ClaimsPrincipal principal, ArticleReviewService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.ListAsync(userId, q, page ?? 1, pageSize ?? ArticleReviewService.DefaultPageSize, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithSummary("Published articles a scholar may review, the latest edited first, with the caller's latest review of each.")
            .WithDescription("q filters by title (case-insensitive). page from 1, pageSize 1 to 100 (20 by default).")
            .Produces<ArticleReviewArticlePageDto>()
            .ProducesApiProblem(StatusCodes.Status401Unauthorized);

        group.MapGet("/{articleId:int}", async (int articleId, ClaimsPrincipal principal, ArticleReviewService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.GetAsync(articleId, userId, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithSummary("The latest revision of a published article, what the caller's review covers, and their reviews of it.")
            .WithDescription("canReview is true only for a scholar with an approved application. 404 article_not_found (not published, in the trash, or without a revision).")
            .Produces<ArticleReviewContextDto>()
            .ProducesApiProblem(StatusCodes.Status401Unauthorized, StatusCodes.Status404NotFound);

        group.MapPost("/{articleId:int}", async (int articleId, ArticleReviewCreateDto dto, ClaimsPrincipal principal, ArticleReviewService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.ReviewAsync(articleId, userId, dto, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithSummary("Gives the caller's verdict on the article's latest revision; a second verdict on the same revision replaces the first.")
            .WithDescription(
                "Logged as ArticleReviewed (to: the verdict; from: the verdict it replaced). "
                + "400 article_review_verdict_invalid, article_review_comment_required (remarks and errors need a comment) or "
                + "article_review_comment_too_long (params.maxLength); 404 article_not_found; 409 article_review_not_verified_scholar, "
                + "article_review_revision_outdated (params.latest: the article changed since it was opened) or article_review_conflict.")
            .Produces<ArticleReviewDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status401Unauthorized, StatusCodes.Status404NotFound, StatusCodes.Status409Conflict);

        return builder;
    }
}
