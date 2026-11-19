namespace Mktba.Domain.Entities;

/// <summary>
/// One anonymous message from a visitor (F-02, #67). The row is both the record and the delivery
/// queue: a background worker turns every <see cref="FeedbackDeliveryState.Pending"/> row into an
/// issue in the project's GitHub repository. Decision D9 (#37): the repository is public, so
/// <see cref="Contact"/> never leaves the database; the issue only says whether one was left and
/// carries the row's <see cref="Id"/> to find it by.
/// </summary>
public class FeedbackMessage
{
    public const int TextMaxLength = 4000;
    public const int ContactMaxLength = 200;
    public const int PageUrlMaxLength = 2048;
    public const int MazhabMaxLength = 64;
    public const int LastErrorMaxLength = 1000;
    public const int IssueUrlMaxLength = 512;

    public int Id { get; set; }

    /// <summary>
    /// Random key written into the issue body as a hidden marker, so a retry can recognise an issue
    /// an earlier, interrupted attempt already created.
    /// </summary>
    public Guid DeliveryKey { get; set; }

    public FeedbackType Type { get; set; }

    /// <summary>The visitor's text, trimmed.</summary>
    public string Text { get; set; } = string.Empty;

    /// <summary>How to reach the visitor, if they chose to say (free text). Never sent to GitHub.</summary>
    public string? Contact { get; set; }

    /// <summary>The page the visitor was on: an absolute http(s) URL or a site-relative path.</summary>
    public string? PageUrl { get; set; }

    /// <summary>The article the message is about, if any; cleared when the article is deleted.</summary>
    public int? ArticleId { get; set; }

    public Article? Article { get; set; }

    /// <summary>Slug of the canonical school the visitor had chosen, if any.</summary>
    public string? Mazhab { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public FeedbackDeliveryState DeliveryState { get; set; }

    /// <summary>
    /// Delivery attempts started. A concurrency token: an attempt begins by incrementing it, so two
    /// workers cannot take the same row at once.
    /// </summary>
    public int Attempts { get; set; }

    /// <summary>A pending row is not tried before this moment.</summary>
    public DateTime NextAttemptAtUtc { get; set; }

    public DateTime? LastAttemptAtUtc { get; set; }

    /// <summary>Why the last attempt failed (no secrets: status codes and GitHub's message); null after a success.</summary>
    public string? LastError { get; set; }

    public DateTime? DeliveredAtUtc { get; set; }

    public int? GitHubIssueNumber { get; set; }

    public string? GitHubIssueUrl { get; set; }
}

/// <summary>What the message is about. Values start at 1, so a request without a type is not read as one.</summary>
public enum FeedbackType
{
    /// <summary>A mistake in an article.</summary>
    ArticleError = 1,

    /// <summary>Something on the site does not work.</summary>
    SiteProblem = 2,

    /// <summary>A suggestion.</summary>
    Idea = 3,
}

public enum FeedbackDeliveryState
{
    /// <summary>
    /// Waiting for an issue: just received, GitHub was unreachable or refused the app's credentials
    /// (retried with a growing delay, without a limit), or the GitHub App is not configured at all
    /// (nothing is attempted until it is).
    /// </summary>
    Pending,

    /// <summary>The issue exists (<see cref="FeedbackMessage.GitHubIssueNumber"/>).</summary>
    Delivered,

    /// <summary>GitHub rejected this message itself as invalid; it is not retried and needs a person.</summary>
    Failed,
}
