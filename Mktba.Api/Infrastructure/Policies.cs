using Microsoft.AspNetCore.Authorization;
using Mktba.Domain.Entities;

namespace Mktba.Api.Infrastructure;

/// <summary>
/// The named authorization policies. Every protected endpoint names one of these; no endpoint checks
/// a role itself. A policy says which roles pass it; per-article rules (an author editing only their
/// own articles, U-02 #30) are a separate check on top: <see cref="ArticleAccessGuard"/>, with the
/// rules in <see cref="ArticleViewer"/>.
/// </summary>
public static class Policies
{
    /// <summary>Any signed-in user, whatever the role.</summary>
    public const string Authenticated = nameof(Authenticated);

    /// <summary>
    /// Create new articles (they start as drafts, the creator is their author), and pass the role
    /// gate of the endpoints for one existing article, where the per-article check then lets an author
    /// through only for articles they wrote or co-author: Author, Admin.
    /// </summary>
    public const string CanEditArticles = nameof(CanEditArticles);

    /// <summary>
    /// Change, read the drafts and history of any article whoever wrote it, and the actions no author
    /// has even on their own article: delete, move in the tree, change authorship, the legacy
    /// <c>/paragraph</c> endpoints: Admin.
    /// </summary>
    public const string CanEditAnyArticle = nameof(CanEditAnyArticle);

    /// <summary>
    /// Make any status move, publication included (D4, #20): Admin. Authors only submit and take back
    /// their own articles (<see cref="ArticleStatusTransitions.IsAuthorMove"/>).
    /// </summary>
    public const string CanReviewArticles = nameof(CanReviewArticles);

    /// <summary>
    /// Review articles as a scholar (V-03, #119; D5, #115: the mark belongs to a revision): Scholar,
    /// Admin. The verdict itself needs an approved scholar application, which an admin never has.
    /// </summary>
    public const string CanVerify = nameof(CanVerify);

    /// <summary>List users and invite new ones: Admin.</summary>
    public const string CanManageUsers = nameof(CanManageUsers);

    /// <summary>Site settings, AI provider and maintenance (<c>/admin/*</c>): Admin.</summary>
    public const string CanConfigure = nameof(CanConfigure);

    /// <summary>The whole site's own statistics (N-05, #99, <c>/analytics/site</c>): Admin.</summary>
    public const string CanViewSiteAnalytics = nameof(CanViewSiteAnalytics);

    /// <summary>The audit log of publications, deletions and role changes (U-09, #135, <c>/audit-log</c>): Admin.</summary>
    public const string CanViewAuditLog = nameof(CanViewAuditLog);

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
            [CanViewSiteAnalytics] = [UserRole.Admin],
            [CanViewAuditLog] = [UserRole.Admin],
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
