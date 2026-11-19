using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Infrastructure.Data;

namespace Mktba.Application.Services;

/// <summary>
/// Pure rules of a user profile (U-07, #72): how written values are normalized and what is valid.
/// The profile slug follows <see cref="ArticleSlugRules"/> (same transliteration, same shape), with
/// its own fallback word. Client mirror: <c>mktba.react/src/shared/profile.ts</c>.
/// </summary>
public static class UserProfileRules
{
    /// <summary>Slug used when the display name has nothing to transliterate (for example, a name in Arabic script).</summary>
    public const string SlugFallback = "author";

    /// <summary>Most links a profile holds.</summary>
    public const int MaxLinks = 5;

    /// <summary>
    /// The written profile with strings trimmed, blanks turned into null, the slug lowercased, line
    /// breaks of the bio unified to <c>\n</c>, and a missing list of links turned into an empty one.
    /// </summary>
    public static UserProfileWriteDto Normalize(UserProfileWriteDto? profile)
        => new(
            Trimmed(profile?.DisplayName),
            Trimmed(profile?.Slug)?.ToLowerInvariant(),
            Trimmed(profile?.AvatarUrl),
            Trimmed(profile?.Bio)?.Replace("\r\n", "\n").Replace('\r', '\n'),
            Trimmed(profile?.Degree),
            Trimmed(profile?.Institution),
            (profile?.Links ?? [])
                .Select(link => new ProfileLinkDto(Trimmed(link?.Label) ?? string.Empty, Trimmed(link?.Url) ?? string.Empty))
                .ToList());

    /// <summary>The first rule a normalized profile breaks, or null when it is valid. Slug uniqueness is the service's check.</summary>
    public static AppError? Check(UserProfileWriteDto profile)
    {
        if (profile.DisplayName is { } name
            && (name.Length > MktbaDbContext.UserDisplayNameMaxLength || name.Any(char.IsControl)))
        {
            return AppErrors.ProfileDisplayNameInvalid(MktbaDbContext.UserDisplayNameMaxLength);
        }

        if (profile.Slug is { } slug)
        {
            if (profile.DisplayName is null) return AppErrors.ProfileDisplayNameRequired;
            if (!ArticleSlugRules.IsValid(slug)) return AppErrors.ProfileSlugInvalid;
        }

        if (profile.AvatarUrl is { } avatarUrl && !ArticleSeo.IsValidImageUrl(avatarUrl)) return AppErrors.ProfileAvatarUrlInvalid;
        if (profile.Bio?.Length > MktbaDbContext.UserBioMaxLength) return AppErrors.ProfileBioTooLong(MktbaDbContext.UserBioMaxLength);
        if (profile.Degree?.Length > MktbaDbContext.UserDegreeMaxLength) return AppErrors.ProfileDegreeTooLong(MktbaDbContext.UserDegreeMaxLength);
        if (profile.Institution?.Length > MktbaDbContext.UserInstitutionMaxLength)
        {
            return AppErrors.ProfileInstitutionTooLong(MktbaDbContext.UserInstitutionMaxLength);
        }

        var links = profile.Links ?? [];
        if (links.Count > MaxLinks) return AppErrors.ProfileLinksTooMany(MaxLinks);
        foreach (var link in links)
        {
            if (link.Label.Length is 0 or > MktbaDbContext.UserLinkLabelMaxLength || link.Label.Any(char.IsControl))
            {
                return AppErrors.ProfileLinkLabelInvalid(MktbaDbContext.UserLinkLabelMaxLength);
            }

            if (!IsValidLinkUrl(link.Url)) return AppErrors.ProfileLinkUrlInvalid;
        }

        return null;
    }

    /// <summary>The slug a display name gives: <see cref="ArticleSlugRules.FromTitle"/> with <see cref="SlugFallback"/>.</summary>
    public static string SlugFromName(string displayName) => ArticleSlugRules.FromTitle(displayName, SlugFallback);

    /// <summary>An absolute http or https URL with a host and no whitespace: the only kind a profile link may be.</summary>
    public static bool IsValidLinkUrl(string url)
        => url.Length <= MktbaDbContext.UserLinkUrlMaxLength
           && !url.Any(char.IsWhiteSpace)
           && Uri.TryCreate(url, UriKind.Absolute, out var uri)
           && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
           && !string.IsNullOrEmpty(uri.Host);

    private static string? Trimmed(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
