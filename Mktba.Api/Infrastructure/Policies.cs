using Microsoft.AspNetCore.Authorization;
using Mktba.Domain.Entities;

namespace Mktba.Api.Infrastructure;

/// <summary>
/// The named authorization policies. Every protected endpoint names one of these; no endpoint checks
/// a role itself. A policy says which roles pass it; per-object rules (an author editing only their
/// own articles, U-02 #30) are a separate check on top and do not exist yet, so every policy that
/// would need one is admin-only for now.
/// </summary>
public static class Policies
{
    /// <summary>Any signed-in user, whatever the role.</summary>
    public const string Authenticated = nameof(Authenticated);

    /// <summary>Create new articles (they start as drafts, the creator is their author): Author, Admin.</summary>
    public const string CanEditArticles = nameof(CanEditArticles);

    /// <summary>
    /// Change, read the drafts and history of, or delete an existing article whoever wrote it: Admin.
    /// Authors get their own articles through the per-object check of U-02 (#30).
    /// </summary>
    public const string CanEditAnyArticle = nameof(CanEditAnyArticle);

    /// <summary>Move articles between statuses, publication included (D4, #20): Admin.</summary>
    public const string CanReviewArticles = nameof(CanReviewArticles);

    /// <summary>Mark a revision as verified by a scholar (D5, #115): Scholar, Admin. No endpoint uses it yet.</summary>
    public const string CanVerify = nameof(CanVerify);

    /// <summary>List users and invite new ones: Admin.</summary>
    public const string CanManageUsers = nameof(CanManageUsers);

    /// <summary>Site settings, AI provider and maintenance (<c>/admin/*</c>): Admin.</summary>
    public const string CanConfigure = nameof(CanConfigure);

    /// <summary>The roles each policy lets through.</summary>
    public static readonly IReadOnlyDictionary<string, IReadOnlyList<UserRole>> Roles =
        new Dictionary<string, IReadOnlyList<UserRole>>
        {
            [Authenticated] = Enum.GetValues<UserRole>(),
            [CanEditArticles] = [UserRole.Author, UserRole.Admin],
            [CanEditAnyArticle] = [UserRole.Admin],
            [CanReviewArticles] = [UserRole.Admin],
            [CanVerify] = [UserRole.Scholar, UserRole.Admin],
            [CanManageUsers] = [UserRole.Admin],
            [CanConfigure] = [UserRole.Admin],
        };

    /// <summary>Whether <paramref name="role"/> passes <paramref name="policy"/>.</summary>
    public static bool Allows(string policy, UserRole role) => Roles[policy].Contains(role);

    public static AuthorizationBuilder AddMktbaPolicies(this AuthorizationBuilder builder)
    {
        foreach (var (name, roles) in Roles)
        {
            builder.AddPolicy(name, policy => policy
                .RequireAuthenticatedUser()
                .RequireRole(roles.Select(role => role.ToString())));
        }

        return builder;
    }
}
