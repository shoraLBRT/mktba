using System.Security.Claims;

namespace Mktba.Api.Infrastructure
{
    /// <summary>
    /// Whether the caller of a public reading endpoint may see articles that are not Published.
    /// Today that is every admin; per-role rules arrive with U-01/U-02.
    /// </summary>
    public static class ReaderAccess
    {
        public static bool CanSeeUnpublished(this ClaimsPrincipal user) => user.IsInRole("Admin");
    }
}
