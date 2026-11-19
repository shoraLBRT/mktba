using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs
{
    /// <summary>
    /// A visitor's message (F-02, #67). The form fills <paramref name="PageUrl"/>,
    /// <paramref name="ArticleId"/> and <paramref name="Mazhab"/> by itself; a stale article id or
    /// mazhab never fails the request.
    /// </summary>
    /// <param name="Type">ArticleError, SiteProblem or Idea (feedback_type_invalid).</param>
    /// <param name="Text">Required (feedback_text_required), at most 4000 characters after trimming (feedback_text_too_long).</param>
    /// <param name="Contact">
    /// Optional, free text, at most 200 characters (feedback_contact_too_long). Stored only in the
    /// site's database: it is never published.
    /// </param>
    /// <param name="PageUrl">
    /// The page the visitor is on: an absolute http(s) URL or a site-relative path, at most 2048
    /// characters (feedback_page_url_invalid).
    /// </param>
    /// <param name="ArticleId">The article the message is about; an id no article has is dropped.</param>
    /// <param name="Mazhab">Slug of the chosen canonical school (hanafi, maliki, shafii, hanbali); anything else is dropped.</param>
    public record FeedbackCreateDto(
        FeedbackType Type,
        string Text,
        string? Contact,
        string? PageUrl,
        int? ArticleId,
        string? Mazhab
    );

    /// <summary>The message is stored; it reaches the maintainers in the background.</summary>
    /// <param name="Id">Number of the message.</param>
    public record FeedbackAcceptedDto(int Id);
}
