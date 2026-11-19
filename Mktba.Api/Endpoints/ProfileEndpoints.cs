using System.Security.Claims;
using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;

namespace Mktba.Api.Endpoints;

/// <summary>User profiles (U-07, #72): the signed-in user's own, anyone's for an admin, and the public part by slug.</summary>
public static class ProfileEndpoints
{
    private const string WriteErrors =
        "Answers 400 with a profile_* code: profile_display_name_invalid, profile_display_name_required (a slug without a name), "
        + "profile_slug_invalid, profile_slug_taken, profile_avatar_url_invalid, profile_bio_too_long, profile_degree_too_long, "
        + "profile_institution_too_long, profile_links_too_many, profile_link_label_invalid, profile_link_url_invalid.";

    public static IEndpointRouteBuilder MapProfileEndpoints(this IEndpointRouteBuilder builder)
    {
        var own = builder.MapGroup("/profile").WithTags("Profile").RequireAuthorization(Policies.Authenticated);

        own.MapGet("/", async (ClaimsPrincipal principal, UserProfileService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.GetAsync(userId, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithSummary("The signed-in user's profile.")
            .WithDescription("Every field is empty until the user fills it in. isPublic says whether readers can open the profile now.")
            .Produces<UserProfileDto>()
            .ProducesApiProblem(StatusCodes.Status401Unauthorized);

        own.MapPut("/", async (UserProfileWriteDto dto, ClaimsPrincipal principal, UserProfileService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.UpdateAsync(userId, dto, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithSummary("Replaces the signed-in user's whole profile.")
            .WithDescription(
                "A blank value clears its field. A blank slug keeps the current one or, the first time a display name is set, "
                + "is derived from the name; clearing the name clears the slug. A changed slug is not kept as a redirect. "
                + WriteErrors)
            .Produces<UserProfileDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status401Unauthorized);

        var users = builder.MapGroup("/users").WithTags("Users").RequireAuthorization(Policies.CanManageUsers);

        users.MapGet("/{id:int}/profile", async (int id, UserProfileService service, CancellationToken cancellationToken) =>
                Results.Ok(await service.GetAsync(id, cancellationToken)))
            .WithSummary("Any user's profile, for an admin.")
            .Produces<UserProfileDto>()
            .ProducesApiProblem(StatusCodes.Status404NotFound);

        users.MapPut("/{id:int}/profile", async (int id, UserProfileWriteDto dto, UserProfileService service, CancellationToken cancellationToken) =>
                Results.Ok(await service.UpdateAsync(id, dto, cancellationToken)))
            .WithSummary("Replaces any user's whole profile, for an admin.")
            .WithDescription("The same rules as PUT /profile. " + WriteErrors + " Answers 404 user_not_found for an unknown user.")
            .Produces<UserProfileDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound);

        builder.MapGet("/authors/{slug}", async (string slug, UserProfileService service, CancellationToken cancellationToken) =>
                Results.Ok(await service.GetPublicAsync(slug, cancellationToken)))
            .WithTags("Profile")
            .WithSummary("The public profile of an author, by slug.")
            .WithDescription(
                "Only what readers may see: no email, no user id. Answers 404 author_not_found unless the user has a display name "
                + "and is the author or a co-author of at least one Published article, so accounts cannot be listed through it. "
                + "degree and institution are self-declared and given only for a user whose role is Scholar.")
            .Produces<PublicProfileDto>()
            .ProducesApiProblem(StatusCodes.Status404NotFound);

        return builder;
    }
}
