using Microsoft.EntityFrameworkCore;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services;

/// <summary>
/// User profiles (U-07, #72): a user reads and replaces their own, an admin anyone's, and readers
/// get the public part by slug. The public part never carries an email or a user id, and exists
/// only for a user with a display name who is credited on a Published article, so the endpoint
/// cannot be used to list accounts.
/// </summary>
public class UserProfileService
{
    private readonly UserRepository _users;

    public UserProfileService(UserRepository users)
    {
        _users = users;
    }

    /// <summary>The profile of user <paramref name="userId"/> as its owner sees it.</summary>
    /// <exception cref="NotFoundException"><c>user_not_found</c>.</exception>
    public async Task<UserProfileDto> GetAsync(int userId, CancellationToken cancellationToken = default)
    {
        var user = await _users.FindWithLinksReadOnlyAsync(userId, cancellationToken)
            ?? throw new NotFoundException(AppErrors.UserNotFound(userId));
        return await ToDtoAsync(user, cancellationToken);
    }

    /// <summary>
    /// Replaces the whole profile of user <paramref name="userId"/>. A blank slug keeps the current one
    /// or, when the user gets a display name for the first time, is derived from the name (name,
    /// name-2, … until free). Clearing the name clears the slug. An old slug is not kept: its
    /// address answers 404 and may be taken by someone else.
    /// </summary>
    /// <exception cref="ValidationException">A <c>profile_*</c> code, see <see cref="UserProfileWriteDto"/>.</exception>
    /// <exception cref="NotFoundException"><c>user_not_found</c>.</exception>
    public async Task<UserProfileDto> UpdateAsync(int userId, UserProfileWriteDto? dto, CancellationToken cancellationToken = default)
    {
        var profile = UserProfileRules.Normalize(dto);
        if (UserProfileRules.Check(profile) is { } error)
        {
            throw new ValidationException(error);
        }

        var user = await _users.FindWithLinksAsync(userId, cancellationToken)
            ?? throw new NotFoundException(AppErrors.UserNotFound(userId));

        var slug = await ChooseSlugAsync(user, profile, cancellationToken);
        var slugChanged = slug is not null && slug != user.Slug;

        user.DisplayName = profile.DisplayName;
        user.Slug = slug;
        user.AvatarUrl = profile.AvatarUrl;
        user.Bio = profile.Bio;
        user.Degree = profile.Degree;
        user.Institution = profile.Institution;
        user.Links.Clear();
        user.Links.AddRange(profile.Links!.Select((link, index) => new UserLink { Order = index, Label = link.Label, Url = link.Url }));

        try
        {
            await _users.SaveChangesAsync();
        }
        catch (DbUpdateException) when (slugChanged)
        {
            // Two users saving the same new slug at once: the unique index lets one through.
            throw new ValidationException(AppErrors.ProfileSlugTaken(slug!));
        }

        return await ToDtoAsync(user, cancellationToken);
    }

    /// <summary>The public profile at <paramref name="slug"/>.</summary>
    /// <exception cref="NotFoundException">
    /// <c>author_not_found</c>: no such slug, or its user is not credited on a Published article.
    /// </exception>
    public async Task<PublicProfileDto> GetPublicAsync(string slug, CancellationToken cancellationToken = default)
    {
        var user = await _users.FindPublicBySlugAsync(slug, cancellationToken);
        if (user?.DisplayName is null || user.Slug is null)
        {
            throw new NotFoundException(AppErrors.AuthorNotFound);
        }

        var isScholar = user.Role == UserRole.Scholar;
        return new PublicProfileDto(
            user.Slug,
            user.DisplayName,
            user.Role,
            user.AvatarUrl,
            user.Bio,
            isScholar ? user.Degree : null,
            isScholar ? user.Institution : null,
            LinksOf(user));
    }

    private async Task<string?> ChooseSlugAsync(User user, UserProfileWriteDto profile, CancellationToken cancellationToken)
    {
        if (profile.DisplayName is null)
        {
            return null;
        }

        if (profile.Slug is { } requested)
        {
            if (requested != user.Slug && await _users.IsSlugTakenAsync(requested, user.Id, cancellationToken))
            {
                throw new ValidationException(AppErrors.ProfileSlugTaken(requested));
            }

            return requested;
        }

        if (user.Slug is not null)
        {
            return user.Slug;
        }

        var baseSlug = UserProfileRules.SlugFromName(profile.DisplayName);
        for (var number = 1; ; number++)
        {
            var candidate = ArticleSlugRules.WithSuffix(baseSlug, number);
            if (!await _users.IsSlugTakenAsync(candidate, user.Id, cancellationToken))
            {
                return candidate;
            }
        }
    }

    private async Task<UserProfileDto> ToDtoAsync(User user, CancellationToken cancellationToken)
        => new(
            user.Id,
            user.Role,
            user.DisplayName,
            user.Slug,
            user.AvatarUrl,
            user.Bio,
            user.Degree,
            user.Institution,
            LinksOf(user),
            user.DisplayName is not null && await _users.IsCreditedOnPublishedArticleAsync(user.Id, cancellationToken));

    private static List<ProfileLinkDto> LinksOf(User user)
        => user.Links.OrderBy(link => link.Order).Select(link => new ProfileLinkDto(link.Label, link.Url)).ToList();
}
