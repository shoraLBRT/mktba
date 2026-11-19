using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs
{
    /// <summary>One link of a user profile (U-07, #72).</summary>
    /// <param name="Label">What the link is, 1 to 60 characters (profile_link_label_invalid).</param>
    /// <param name="Url">An absolute http or https URL, at most 2048 characters (profile_link_url_invalid).</param>
    public record ProfileLinkDto(string Label, string Url);

    /// <summary>
    /// A user's whole profile as written: a full replace, where a blank or missing value clears the
    /// field. Every field is optional.
    /// </summary>
    /// <param name="DisplayName">The name readers see: one line, at most 100 characters (profile_display_name_invalid).</param>
    /// <param name="Slug">
    /// URL segment of the public page, by the article slug rules (profile_slug_invalid), unique
    /// (profile_slug_taken). Blank keeps the current one or, the first time a name is set, derives it
    /// from the name. Needs a display name (profile_display_name_required); clearing the name clears it.
    /// </param>
    /// <param name="AvatarUrl">An absolute http(s) URL or a site-relative path, at most 2048 characters (profile_avatar_url_invalid). No upload.</param>
    /// <param name="Bio">Plain text, line breaks allowed, at most 1000 characters (profile_bio_too_long).</param>
    /// <param name="Degree">Self-declared academic degree, at most 150 characters (profile_degree_too_long).</param>
    /// <param name="Institution">Self-declared place of study or work, at most 200 characters (profile_institution_too_long).</param>
    /// <param name="Links">At most 5 links, in the order shown (profile_links_too_many).</param>
    public record UserProfileWriteDto(
        string? DisplayName,
        string? Slug,
        string? AvatarUrl,
        string? Bio,
        string? Degree,
        string? Institution,
        List<ProfileLinkDto>? Links
    );

    /// <summary>A user's profile as its owner (or an admin) sees it. Never carries the email.</summary>
    /// <param name="Role">The user's current role.</param>
    /// <param name="Slug">Set exactly when <paramref name="DisplayName"/> is.</param>
    /// <param name="IsPublic">
    /// Whether readers can open the profile now: it has a display name and the user is the author or
    /// a co-author of at least one Published article.
    /// </param>
    public record UserProfileDto(
        int UserId,
        UserRole Role,
        string? DisplayName,
        string? Slug,
        string? AvatarUrl,
        string? Bio,
        string? Degree,
        string? Institution,
        List<ProfileLinkDto> Links,
        bool IsPublic
    );

    /// <summary>
    /// What readers see of a user (U-07, #72): no id, no email. Exists only for a user with a display
    /// name who is credited on a Published article.
    /// </summary>
    /// <param name="Bio">Plain text; render it as text, never as markup.</param>
    /// <param name="Degree">Self-declared, not verified; given only while the user's role is Scholar.</param>
    /// <param name="Institution">Self-declared, not verified; given only while the user's role is Scholar.</param>
    /// <param name="Links">The user's own links: render them with rel="nofollow noopener".</param>
    public record PublicProfileDto(
        string Slug,
        string DisplayName,
        UserRole Role,
        string? AvatarUrl,
        string? Bio,
        string? Degree,
        string? Institution,
        List<ProfileLinkDto> Links
    );
}
