using System.Globalization;
using System.Security.Claims;

namespace Mktba.Api.Infrastructure
{
    /// <summary>The signed-in user behind a request, as named by the JWT.</summary>
    public static class CurrentUser
    {
        /// <summary>The user id from the token's NameIdentifier claim; null if absent or not a number.</summary>
        public static int? GetUserId(this ClaimsPrincipal user)
            => int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), NumberStyles.None, CultureInfo.InvariantCulture, out var id)
                ? id
                : null;
    }
}
