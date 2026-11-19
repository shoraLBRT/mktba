using System.Security.Claims;
using Mktba.Domain.Entities;

namespace Mktba.Api.Infrastructure
{
    /// <summary>
    /// Whether the caller of a public reading endpoint may see articles that are not Published:
    /// whoever may edit any article (<see cref="Policies.CanEditAnyArticle"/>). Authors seeing their
    /// own drafts is part of U-02 (#30).
    /// </summary>
    public static class ReaderAccess
    {
        public static bool CanSeeUnpublished(this ClaimsPrincipal user) =>
            Policies.Roles[Policies.CanEditAnyArticle].Any(role => user.IsInRole(role.ToString()));
    }
}
