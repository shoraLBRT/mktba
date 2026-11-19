using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Api.Infrastructure
{
    /// <summary>
    /// What a caller wants to do with one existing article (U-02, #30). Checked by
    /// <see cref="ArticleAuthorizationHandler"/> against the article's <see cref="ArticleAccessRow"/>,
    /// on top of the endpoint's role policy.
    /// </summary>
    public sealed class ArticleOperationRequirement : IAuthorizationRequirement
    {
        private ArticleOperationRequirement(ArticleStatus? targetStatus)
        {
            TargetStatus = targetStatus;
        }

        /// <summary>The status to move to, for <see cref="ChangeStatus"/>; null for <see cref="Edit"/>.</summary>
        public ArticleStatus? TargetStatus { get; }

        /// <summary>
        /// Change the content or custom schools, or read the history (revisions, compare, restore):
        /// an admin any article, an author their own.
        /// </summary>
        public static ArticleOperationRequirement Edit { get; } = new(null);

        /// <summary>Move to <paramref name="target"/>: an admin any move, an author only submit / take back on their own.</summary>
        public static ArticleOperationRequirement ChangeStatus(ArticleStatus target) => new(target);
    }

    /// <summary>The per-article check: the rules themselves are <see cref="ArticleViewer"/>'s.</summary>
    public sealed class ArticleAuthorizationHandler : AuthorizationHandler<ArticleOperationRequirement, ArticleAccessRow>
    {
        protected override Task HandleRequirementAsync(
            AuthorizationHandlerContext context, ArticleOperationRequirement requirement, ArticleAccessRow article)
        {
            var viewer = context.User.ToArticleViewer();
            var allowed = requirement.TargetStatus is { } target
                ? viewer.CanChangeStatus(article.Status, target, article.AuthorId, article.CoAuthorIds)
                : viewer.CanEdit(article.AuthorId, article.CoAuthorIds);
            if (allowed)
            {
                context.Succeed(requirement);
            }

            return Task.CompletedTask;
        }
    }

    /// <summary>
    /// Runs the per-article check for an endpoint and turns a refusal into the API's problem
    /// response. A caller who may not even see the article (a draft of someone else) gets 404
    /// <c>article_not_found</c>, as on the reading endpoints, so drafts do not leak through ids; a
    /// caller who may see it but not do this gets 403 <c>forbidden</c>.
    /// </summary>
    public sealed class ArticleAccessGuard(
        ArticleRepository articles, SchoolRepository schools, IAuthorizationService authorization)
    {
        /// <summary>Null when <paramref name="user"/> may do <paramref name="requirement"/> on the article, else the problem to answer.</summary>
        public async Task<IResult?> CheckAsync(ClaimsPrincipal user, int articleId, ArticleOperationRequirement requirement)
        {
            var article = await articles.GetAccessRowAsync(articleId);
            if (article is null)
            {
                return ApiProblemResults.Problem(StatusCodes.Status404NotFound, AppErrors.ArticleNotFound);
            }

            if ((await authorization.AuthorizeAsync(user, article, requirement)).Succeeded)
            {
                return null;
            }

            return user.ToArticleViewer().CanSee(article.Status, article.AuthorId, article.CoAuthorIds)
                ? ApiProblemResults.Problem(StatusCodes.Status403Forbidden, AppErrors.Forbidden)
                : ApiProblemResults.Problem(StatusCodes.Status404NotFound, AppErrors.ArticleNotFound);
        }

        /// <summary>
        /// The check for deleting a school: editing the article a custom school belongs to. A system
        /// school belongs to no article; only an admin gets past here (and is then told it cannot be deleted).
        /// </summary>
        public async Task<IResult?> CheckSchoolAsync(ClaimsPrincipal user, int schoolId)
        {
            var school = await schools.GetByIdAsync(schoolId);
            if (school is null)
            {
                return ApiProblemResults.Problem(StatusCodes.Status404NotFound, AppErrors.SchoolNotFound);
            }

            if (school.ArticleScopeId is int articleId)
            {
                return await CheckAsync(user, articleId, ArticleOperationRequirement.Edit);
            }

            return user.ToArticleViewer().EditsAnyArticle
                ? null
                : ApiProblemResults.Problem(StatusCodes.Status403Forbidden, AppErrors.Forbidden);
        }
    }

    public static class ArticleAccessEndpointExtensions
    {
        /// <summary>Runs <see cref="ArticleAccessGuard.CheckAsync"/> for the article in the route's <c>{id}</c> before the handler; the endpoint documents its own 404.</summary>
        public static RouteHandlerBuilder RequireArticleAccess(this RouteHandlerBuilder builder, ArticleOperationRequirement requirement) =>
            builder
                .AddEndpointFilter(async (context, next) =>
                {
                    var articleId = Convert.ToInt32(context.HttpContext.Request.RouteValues["id"], System.Globalization.CultureInfo.InvariantCulture);
                    var guard = context.HttpContext.RequestServices.GetRequiredService<ArticleAccessGuard>();
                    return await guard.CheckAsync(context.HttpContext.User, articleId, requirement) ?? await next(context);
                })
                .ProducesApiProblem(StatusCodes.Status403Forbidden);

        public static IServiceCollection AddArticleAccess(this IServiceCollection services) =>
            services
                .AddScoped<ArticleAccessGuard>()
                .AddSingleton<IAuthorizationHandler, ArticleAuthorizationHandler>();
    }
}
