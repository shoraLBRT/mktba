using System.Security.Claims;
using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;

namespace Mktba.Api.Endpoints
{
    /// <summary>
    /// The caller's own autosaved draft (E-02, #75): of an article they may edit
    /// (<c>/articles/{id}/draft</c>) or of the article they are creating (<c>/articles/draft</c>).
    /// Nobody reads another user's draft, a reviewer or an admin included.
    /// </summary>
    public static class ArticleDraftEndpoints
    {
        private const string Description =
            "Each user has their own draft per article and one for a new article; it is not a revision and "
            + "readers never see it. A content save (POST /articles/content, PUT /articles/{id}/content, a "
            + "rollback) deletes the saving user's draft. A draft not written for 30 days is deleted.";

        private const string WriteErrors = " Errors: article_draft_snapshot_invalid, article_draft_too_large.";

        public static IEndpointRouteBuilder MapArticleDraftEndpoints(this IEndpointRouteBuilder builder)
        {
            var group = builder.MapGroup("/articles").WithTags("ArticleDraft").RequireAuthorization(Policies.CanEditArticles);

            group.MapGet("/{id:int}/draft", (int id, ClaimsPrincipal user, ArticleDraftService service, CancellationToken cancellationToken) =>
                    GetAsync(id, user, service, cancellationToken))
                .WithSummary("The caller's autosaved draft of the article; 204 when there is none.")
                .WithDescription(Description)
                .Produces<ArticleDraftDto>()
                .Produces(StatusCodes.Status204NoContent)
                .ProducesApiProblem(StatusCodes.Status404NotFound)
                .RequireArticleAccess(ArticleOperationRequirement.Edit);

            group.MapPut("/{id:int}/draft", (int id, ArticleDraftSaveDto dto, ClaimsPrincipal user, ArticleDraftService service, CancellationToken cancellationToken) =>
                    SaveAsync(id, dto, user, service, cancellationToken))
                .WithSummary("Writes the caller's autosaved draft of the article.")
                .WithDescription(Description + WriteErrors)
                .Produces<ArticleDraftDto>()
                .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound)
                .RequireArticleAccess(ArticleOperationRequirement.Edit);

            group.MapDelete("/{id:int}/draft", (int id, ClaimsPrincipal user, ArticleDraftService service, CancellationToken cancellationToken) =>
                    DeleteAsync(id, user, service, cancellationToken))
                .WithSummary("Deletes the caller's autosaved draft of the article; 204 also when there was none.")
                .Produces(StatusCodes.Status204NoContent)
                .ProducesApiProblem(StatusCodes.Status404NotFound)
                .RequireArticleAccess(ArticleOperationRequirement.Edit);

            group.MapGet("/draft", (ClaimsPrincipal user, ArticleDraftService service, CancellationToken cancellationToken) =>
                    GetAsync(null, user, service, cancellationToken))
                .WithSummary("The caller's autosaved draft of a new article; 204 when there is none.")
                .WithDescription(Description)
                .Produces<ArticleDraftDto>()
                .Produces(StatusCodes.Status204NoContent);

            group.MapPut("/draft", (ArticleDraftSaveDto dto, ClaimsPrincipal user, ArticleDraftService service, CancellationToken cancellationToken) =>
                    SaveAsync(null, dto, user, service, cancellationToken))
                .WithSummary("Writes the caller's autosaved draft of a new article; baseUpdatedAt is ignored.")
                .WithDescription(Description + WriteErrors)
                .Produces<ArticleDraftDto>()
                .ProducesApiProblem(StatusCodes.Status400BadRequest);

            group.MapDelete("/draft", (ClaimsPrincipal user, ArticleDraftService service, CancellationToken cancellationToken) =>
                    DeleteAsync(null, user, service, cancellationToken))
                .WithSummary("Deletes the caller's autosaved draft of a new article; 204 also when there was none.")
                .Produces(StatusCodes.Status204NoContent);

            return builder;
        }

        private static async Task<IResult> GetAsync(int? articleId, ClaimsPrincipal user, ArticleDraftService service, CancellationToken cancellationToken)
        {
            if (user.GetUserId() is not int userId) return Unauthorized();
            var draft = await service.GetAsync(userId, articleId, cancellationToken);
            return draft is null ? Results.NoContent() : Results.Ok(draft);
        }

        private static async Task<IResult> SaveAsync(int? articleId, ArticleDraftSaveDto dto, ClaimsPrincipal user, ArticleDraftService service, CancellationToken cancellationToken) =>
            user.GetUserId() is int userId
                ? Results.Ok(await service.SaveAsync(userId, articleId, dto, cancellationToken))
                : Unauthorized();

        private static async Task<IResult> DeleteAsync(int? articleId, ClaimsPrincipal user, ArticleDraftService service, CancellationToken cancellationToken)
        {
            if (user.GetUserId() is not int userId) return Unauthorized();
            await service.DeleteAsync(userId, articleId, cancellationToken);
            return Results.NoContent();
        }

        private static IResult Unauthorized() => ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized);
    }
}
