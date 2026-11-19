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
    /// A user as the admin sees them when choosing authors. Admin-only: users have no public
    /// display name yet, and emails are never shown to readers.
    /// </summary>
    public class UserSummaryDto
    {
        public int Id { get; set; }
        public string Email { get; set; } = string.Empty;
    }
}
