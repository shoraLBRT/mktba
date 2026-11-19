using System.Security.Claims;
using Mktba.Domain.Entities;

namespace Mktba.Api.Infrastructure
{
    /// <summary>The caller as an <see cref="ArticleViewer"/>, built from the role policies in <see cref="Policies"/>.</summary>
    public static class ReaderAccess
    {
        /// <summary>
        /// Admin-like rights come from <see cref="Policies.CanEditAnyArticle"/> and
        /// <see cref="Policies.CanReviewArticles"/>; ownership counts only for roles that pass
        /// <see cref="Policies.CanEditArticles"/>. An anonymous caller is <see cref="ArticleViewer.Anonymous"/>.
        /// </summary>
        public static ArticleViewer ToArticleViewer(this ClaimsPrincipal user) => new(
            UserId: user.Passes(Policies.CanEditArticles) ? user.GetUserId() : null,
            EditsAnyArticle: user.Passes(Policies.CanEditAnyArticle),
            ReviewsArticles: user.Passes(Policies.CanReviewArticles));

        private static bool Passes(this ClaimsPrincipal user, string policy) =>
            Policies.Roles[policy].Any(role => user.IsInRole(role.ToString()));
    }
}
