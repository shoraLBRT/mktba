using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs
{
    /// <summary>
    /// Who is credited for an article. The author is set from the creating user and may be changed
    /// here; co-authors are other users and never include the author.
    /// </summary>
    public class ArticleAuthorsDto
    {
        /// <summary>The article's author; null leaves the article without one.</summary>
        public int? AuthorId { get; set; }

        /// <summary>Co-author user ids; duplicates are ignored, the author may not be listed.</summary>
        public List<int> CoAuthorIds { get; set; } = new();
    }

    /// <summary>
    /// A user as the admin sees them when choosing authors. Admin-only: emails are never shown to
    /// readers, who get <see cref="PublicProfileDto"/> instead.
    /// </summary>
    public class UserSummaryDto
    {
        public int Id { get; set; }
        public string Email { get; set; } = string.Empty;

        /// <summary>The name from the user's profile (U-07); null while they have not set one.</summary>
        public string? DisplayName { get; set; }

        /// <summary>The user's current role.</summary>
        public UserRole Role { get; set; }
    }

    /// <summary>A new role for a user (U-04). The last admin cannot be given another role.</summary>
    public class UserRoleUpdateDto
    {
        public UserRole Role { get; set; }
    }
}
