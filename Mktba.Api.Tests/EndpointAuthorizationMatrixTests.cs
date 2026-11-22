using System.Net;
using System.Net.Http.Json;
using System.Text;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>
/// U-01 (#29), U-02 (#30): every endpoint the API maps is listed here with the policy it must require, and
/// every protected endpoint is called as anonymous and as each role. A new endpoint fails these
/// tests until it is added to <see cref="ExpectedPolicies"/>.
/// </summary>
public sealed class EndpointAuthorizationMatrixTests : IClassFixture<MktbaApiFactory>
{
    private const string Public = "(public)";

    /// <summary>"METHOD route" → the policy it requires, or <see cref="Public"/>.</summary>
    private static readonly IReadOnlyDictionary<string, string> ExpectedPolicies = new Dictionary<string, string>
    {
        ["GET /auth/status"] = Public,
        ["POST /auth/register"] = Public,
        ["POST /auth/login"] = Public,
        ["POST /auth/refresh"] = Public,
        ["POST /auth/logout"] = Public,
        ["POST /auth/logout-all"] = Policies.Authenticated,
        ["GET /auth/sessions"] = Policies.Authenticated,
        ["DELETE /auth/sessions/{id:guid}"] = Policies.Authenticated,
        ["GET /auth/me"] = Policies.Authenticated,
        ["GET /users/"] = Policies.CanManageUsers,
        ["PUT /users/{id:int}/role"] = Policies.CanManageUsers,
        ["GET /profile/"] = Policies.Authenticated,
        ["PUT /profile/"] = Policies.Authenticated,
        ["GET /profile/activity"] = Policies.Authenticated,
        ["GET /users/{id:int}/profile"] = Policies.CanManageUsers,
        ["PUT /users/{id:int}/profile"] = Policies.CanManageUsers,
        ["GET /authors/{slug}"] = Public,
        ["GET /authors/{slug}/articles"] = Public,
        ["GET /invites/"] = Policies.CanManageUsers,
        ["POST /invites/"] = Policies.CanManageUsers,
        ["POST /invites/{id:int}/revoke"] = Policies.CanManageUsers,

        ["GET /navigationTree/tree"] = Public,
        ["GET /articles/"] = Public,
        ["GET /articles/sitemap"] = Public,
        ["GET /articles/recent"] = Public,
        ["GET /search/"] = Public,
        ["POST /feedback"] = Public,
        ["POST /analytics/events"] = Public,
        ["POST /client-errors"] = Public,
        ["GET /health/live"] = Public,
        ["GET /health/ready"] = Public,
        ["GET /seo/indexnow-key"] = Public,
        ["GET /files/{name}"] = Public,
        ["POST /uploads/avatar"] = Policies.Authenticated,
        ["POST /uploads/images"] = Policies.CanEditArticles,
        ["GET /articles/{id:int}"] = Public,
        ["GET /articles/{id:int}/content"] = Public,
        ["GET /articles/by-slug/{slug}/content"] = Public,
        ["GET /schools/system"] = Public,
        ["GET /schools/article/{articleId:int}"] = Public,

        ["POST /articles/"] = Policies.CanEditArticles,
        ["POST /articles/content"] = Policies.CanEditArticles,
        // U-02 (#30): the role gate; the per-article check (ArticleOwnershipEndpointTests) then
        // lets an author through only for articles they wrote or co-author.

        ["PUT /articles/{id:int}"] = Policies.CanEditAnyArticle,
        ["PUT /articles/{id:int}/content"] = Policies.CanEditArticles,
        ["DELETE /articles/{id:int}"] = Policies.CanEditAnyArticle,
        ["GET /articles/trash"] = Policies.CanEditAnyArticle,
        ["POST /articles/trash/{id:int}/restore"] = Policies.CanEditAnyArticle,
        ["DELETE /articles/trash/{id:int}"] = Policies.CanEditAnyArticle,
        ["POST /articles/{id:int}/move"] = Policies.CanEditAnyArticle,
        ["GET /articles/{id:int}/authors"] = Policies.CanEditAnyArticle,
        ["PUT /articles/{id:int}/authors"] = Policies.CanEditAnyArticle,
        ["GET /articles/{id:int}/revisions"] = Policies.CanEditArticles,
        ["GET /articles/{id:int}/revisions/{number:int}"] = Policies.CanEditArticles,
        ["GET /articles/{id:int}/revisions/compare"] = Policies.CanEditArticles,
        ["POST /articles/{id:int}/revisions/{number:int}/restore"] = Policies.CanEditArticles,
        ["GET /articles/{id:int}/draft"] = Policies.CanEditArticles,
        ["PUT /articles/{id:int}/draft"] = Policies.CanEditArticles,
        ["DELETE /articles/{id:int}/draft"] = Policies.CanEditArticles,
        ["GET /articles/draft"] = Policies.CanEditArticles,
        ["PUT /articles/draft"] = Policies.CanEditArticles,
        ["DELETE /articles/draft"] = Policies.CanEditArticles,
        ["GET /paragraph/"] = Policies.CanEditAnyArticle,
        ["GET /paragraph/{id}"] = Policies.CanEditAnyArticle,
        ["POST /paragraph/"] = Policies.CanEditAnyArticle,
        ["PUT /paragraph/{id}"] = Policies.CanEditAnyArticle,
        ["DELETE /paragraph/{id}"] = Policies.CanEditAnyArticle,
        ["POST /schools/"] = Policies.CanEditArticles,
        ["GET /sources/"] = Policies.CanEditArticles,
        ["POST /sources/"] = Policies.CanEditArticles,
        ["PUT /sources/{id:int}"] = Policies.CanEditAnyArticle,
        ["DELETE /sources/{id:int}"] = Policies.CanEditAnyArticle,
        ["GET /tags/"] = Policies.CanEditAnyArticle,
        ["GET /tags/{slug}"] = Public,
        ["PUT /tags/{id:int}"] = Policies.CanEditAnyArticle,
        ["POST /tags/{id:int}/merge"] = Policies.CanEditAnyArticle,
        ["DELETE /schools/{id:int}"] = Policies.CanEditArticles,

        ["POST /articles/{id:int}/status"] = Policies.CanEditArticles,
        // A-02 (#34): each article is then checked like a single status move.
        ["GET /articles/admin-list"] = Policies.CanEditArticles,
        ["POST /articles/bulk/status"] = Policies.CanEditArticles,
        // A-07 (#95): the admin dashboard's counts.
        ["GET /articles/summary"] = Policies.CanEditArticles,
        // A-04 (#87): the moderation queue is for reviewers only.
        ["GET /articles/review-queue"] = Policies.CanReviewArticles,

        ["POST /admin/cleanup"] = Policies.CanConfigure,
        ["GET /admin/ai-settings"] = Policies.CanConfigure,
        ["PUT /admin/ai-settings"] = Policies.CanConfigure,
        ["DELETE /admin/ai-settings"] = Policies.CanConfigure,
        ["POST /admin/ai-style"] = Policies.CanConfigure,
        ["POST /admin/ai-check"] = Policies.CanConfigure,

        // N-05 (#99): the admin dashboard's site-wide statistics.
        ["GET /analytics/site"] = Policies.CanViewSiteAnalytics,
        // N-06 (#100): the search analytics of the admin dashboard.
        ["GET /analytics/search"] = Policies.CanViewSiteAnalytics,
        // N-07 (#101): the content analytics of the admin dashboard.
        ["GET /analytics/content"] = Policies.CanViewSiteAnalytics,
        // P-03 (#91): the author dashboard, the signed-in user's own articles only.
        ["GET /analytics/me"] = Policies.CanEditArticles,
        // N-09 (#103): one article's statistics; the per-article check (admin, author, co-author) is RequireArticleAccess.
        ["GET /analytics/articles/{id:int}"] = Policies.CanEditArticles,
    };

    private readonly MktbaApiFactory _factory;

    public EndpointAuthorizationMatrixTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public void GivenTheMappedEndpoints_WhenComparedWithTheExpectedTable_ThenEachRequiresItsPolicy()
    {
        var actual = MappedEndpoints().ToDictionary(e => e.Key, e => e.Policy ?? Public);

        actual.Should().BeEquivalentTo(ExpectedPolicies);
    }

    [Fact]
    public void GivenEveryPolicy_WhenRolesAreListed_ThenOnlyAdminPassesTheAdminPoliciesAndReaderOnlyAuthenticated()
    {
        foreach (var policy in Policies.Roles.Keys)
        {
            Policies.Allows(policy, UserRole.Admin).Should().BeTrue(policy);
            Policies.Allows(policy, UserRole.Reader).Should().Be(policy == Policies.Authenticated, policy);
        }

        Policies.Allows(Policies.CanEditArticles, UserRole.Author).Should().BeTrue();
        Policies.Allows(Policies.CanEditAnyArticle, UserRole.Author).Should().BeFalse();
        Policies.Allows(Policies.CanVerify, UserRole.Scholar).Should().BeTrue();
        Policies.Allows(Policies.CanEditArticles, UserRole.Scholar).Should().BeFalse();
    }

    [Fact]
    public async Task GivenEachProtectedEndpoint_WhenCalledAnonymouslyAndAsEachRole_ThenOnlyThePolicyRolesGetThrough()
    {
        var clients = new Dictionary<UserRole, HttpClient>();
        foreach (var role in Enum.GetValues<UserRole>())
        {
            clients[role] = (await RoleClients.CreateAsync(_factory, role)).Client;
        }
        var anonymous = _factory.CreateClient();
        var failures = new List<string>();

        // Destructive endpoints run last so they cannot disturb the rest of the matrix: cleanup, then
        // logout-all, which ends the sessions of the clients themselves.
        foreach (var endpoint in MappedEndpoints().Where(e => e.Policy is not null)
            .OrderBy(e => e.Key.Contains("logout-all") ? 2 : e.Key.Contains("cleanup") ? 1 : 0))
        {
            var status = await SendAsync(anonymous, endpoint);
            if (status != HttpStatusCode.Unauthorized)
            {
                failures.Add($"{endpoint.Key} anonymous → {(int)status}, expected 401");
            }

            foreach (var (role, client) in clients)
            {
                status = await SendAsync(client, endpoint);
                var allowed = Policies.Allows(endpoint.Policy!, role);
                if (allowed && status is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                {
                    failures.Add($"{endpoint.Key} as {role} → {(int)status}, expected to pass authorization");
                }
                else if (!allowed && status != HttpStatusCode.Forbidden)
                {
                    failures.Add($"{endpoint.Key} as {role} → {(int)status}, expected 403");
                }
            }
        }

        failures.Should().BeEmpty();
    }

    [Fact]
    public async Task GivenAnAuthor_WhenCreatingAnArticle_ThenItIsCreatedAsTheirDraft()
    {
        var (author, authorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);

        var response = await author.PostAsJsonAsync("/articles", new ArticleCreateDto { Title = "Черновик автора" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var article = await response.Content.ReadFromJsonAsync<ArticleReadDto>(ApiJson.Options);
        article!.Status.Should().Be(ArticleStatus.Draft);
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
        db.Articles.Single(a => a.Id == article.Id).AuthorId.Should().Be(authorId);
    }

    [Fact]
    public async Task GivenAnAuthor_WhenPublishingTheirDraft_ThenReturnsForbidden()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var created = await author.PostAsJsonAsync("/articles", new ArticleCreateDto { Title = "Без одобрения" });
        var article = await created.Content.ReadFromJsonAsync<ArticleReadDto>(ApiJson.Options);

        var response = await author.PostAsJsonAsync(
            $"/articles/{article!.Id}/status", new { Status = "Published" }, ApiJson.Options);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    private IEnumerable<(string Key, RouteEndpoint Endpoint, string? Policy)> MappedEndpoints() =>
        _factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .SelectMany(endpoint => (endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? ["ANY"])
                .Select(method => (
                    Key: $"{method} {endpoint.RoutePattern.RawText}",
                    Endpoint: endpoint,
                    Policy: endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>().Select(data => data.Policy).LastOrDefault())));

    private static async Task<HttpStatusCode> SendAsync(HttpClient client, (string Key, RouteEndpoint Endpoint, string? Policy) endpoint)
    {
        var method = endpoint.Key[..endpoint.Key.IndexOf(' ')];
        using var request = new HttpRequestMessage(new HttpMethod(method), FillRoute(endpoint.Endpoint.RoutePattern));
        if (method is "POST" or "PUT")
        {
            request.Content = new StringContent("{}", Encoding.UTF8, "application/json");
        }

        using var response = await client.SendAsync(request);
        return response.StatusCode;
    }

    /// <summary>The route with every parameter set to a value no seeded row has.</summary>
    private static string FillRoute(RoutePattern pattern)
    {
        var path = new StringBuilder();
        foreach (var segment in pattern.PathSegments)
        {
            path.Append('/');
            foreach (var part in segment.Parts)
            {
                path.Append(part switch
                {
                    RoutePatternLiteralPart literal => literal.Content,
                    RoutePatternParameterPart parameter => parameter.ParameterPolicies.Any(p => p.Content == "int") ? "987654"
                        : parameter.ParameterPolicies.Any(p => p.Content == "guid") ? Guid.Empty.ToString()
                        : "missing",
                    _ => string.Empty,
                });
            }
        }

        return path.ToString();
    }
}
