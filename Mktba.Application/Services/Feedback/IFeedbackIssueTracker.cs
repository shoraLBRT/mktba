namespace Mktba.Application.Services.Feedback;

/// <summary>Where feedback messages become issues. The one implementation is <see cref="GitHubIssueClient"/>.</summary>
public interface IFeedbackIssueTracker
{
    /// <summary>Whether there is a tracker to deliver to; while false nothing is attempted.</summary>
    bool IsConfigured { get; }

    /// <summary>The issue whose body contains <paramref name="marker"/>, among those changed since <paramref name="sinceUtc"/>; null when there is none.</summary>
    /// <exception cref="FeedbackTrackerException">The tracker could not be asked.</exception>
    Task<FeedbackIssueRef?> FindByMarkerAsync(string marker, DateTime sinceUtc, CancellationToken cancellationToken);

    /// <exception cref="FeedbackTrackerException">The issue was not created.</exception>
    Task<FeedbackIssueRef> CreateAsync(string title, string body, IReadOnlyList<string> labels, CancellationToken cancellationToken);
}

/// <param name="Number">The issue's number in its repository.</param>
/// <param name="Url">Its web address.</param>
public sealed record FeedbackIssueRef(int Number, string Url);

public enum FeedbackTrackerFailure
{
    /// <summary>
    /// Nothing wrong with the message: the tracker is unreachable, overloaded, rate-limiting, or does
    /// not accept the app's credentials or setup. The message waits and is tried again.
    /// </summary>
    Unavailable,

    /// <summary>The tracker refused this very issue as invalid; trying again would not help.</summary>
    Rejected,
}

/// <summary>A delivery failure. The message is stored with the row, so it must never contain a key or a token.</summary>
public sealed class FeedbackTrackerException : Exception
{
    public FeedbackTrackerException(FeedbackTrackerFailure failure, string message)
        : base(message)
    {
        Failure = failure;
    }

    public FeedbackTrackerFailure Failure { get; }
}
