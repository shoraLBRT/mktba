using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs
{
    /// <summary>
    /// A visitor's message (F-02 #67, F-03 #68). The form fills <paramref name="PageUrl"/>,
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
    /// characters (feedback_page_url_invalid). When the API knows the site's address
    /// (<c>Feedback:SiteUrl</c>), an absolute URL on another origin is dropped, not an error.
    /// </param>
    /// <param name="ArticleId">The article the message is about; an id no article has is dropped.</param>
    /// <param name="Mazhab">Slug of the chosen canonical school (hanafi, maliki, shafii, hanbali); anything else is dropped.</param>
    /// <param name="Website">
    /// A trap for bots, not a real field. The form renders an input named <c>website</c> that
    /// people neither see nor reach (hidden with CSS, <c>tabindex="-1"</c>,
    /// <c>autocomplete="off"</c>, <c>aria-hidden</c>) and sends its value as it is; a person leaves
    /// it empty. A request with anything but white space in it is answered exactly like an accepted
    /// one — 202 with a number — and nothing is stored or sent anywhere.
    /// </param>
    public record FeedbackCreateDto(
        FeedbackType Type,
        string Text,
        string? Contact,
        string? PageUrl,
        int? ArticleId,
        string? Mazhab,
        string? Website = null
    );

    /// <summary>The message is stored; it reaches the maintainers in the background.</summary>
    /// <param name="Id">
    /// Number of the message. A request caught by the trap field gets a number too: one that no
    /// stored message has yet.
    /// </param>
    public record FeedbackAcceptedDto(int Id);
}
