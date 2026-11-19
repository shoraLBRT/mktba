using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services.Feedback;

/// <summary>
/// Turns stored feedback into issues (F-02, #67). The <c>FeedbackMessages</c> table is the queue,
/// so pending messages survive a restart.
/// <para>
/// One attempt: the row's <see cref="FeedbackMessage.Attempts"/> is incremented and its next
/// attempt scheduled and saved <em>before</em> the tracker is called (the counter is a concurrency
/// token, so a second worker loses the row). From the second attempt on, the tracker is first
/// searched for the row's marker and an issue found there is taken as the delivery — that is what
/// keeps an attempt cut off between "GitHub created the issue" and "the row was saved" from
/// producing a second issue. The remaining window: more than 300 issues changed in the repository
/// since the message arrived, or the marker edited out of the issue.
/// </para>
/// <para>
/// A failure that is not about the message (<see cref="FeedbackTrackerFailure.Unavailable"/>) leaves
/// it pending with a doubling delay and no limit of attempts, and ends the run: the other messages
/// would fail the same way. A message the tracker rejects becomes <see cref="FeedbackDeliveryState.Failed"/>.
/// </para>
/// </summary>
public class FeedbackDeliveryService
{
    /// <summary>How far back before the message the marker search starts: clocks of the site and the tracker differ.</summary>
    private static readonly TimeSpan MarkerSearchMargin = TimeSpan.FromMinutes(5);

    private readonly FeedbackRepository _feedback;
    private readonly IFeedbackIssueTracker _tracker;
    private readonly FeedbackDeliveryOptions _options;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<FeedbackDeliveryService> _logger;

    public FeedbackDeliveryService(
        FeedbackRepository feedback,
        IFeedbackIssueTracker tracker,
        IOptions<FeedbackOptions> options,
        TimeProvider timeProvider,
        ILogger<FeedbackDeliveryService> logger)
    {
        _feedback = feedback;
        _tracker = tracker;
        _options = options.Value.Delivery;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    /// <summary>
    /// Tries every pending message whose time has come, the longest-waiting first, up to the batch
    /// size. Does nothing while the tracker is not configured.
    /// </summary>
    public async Task<FeedbackDeliveryRun> DeliverDueAsync(CancellationToken cancellationToken = default)
    {
        if (!_tracker.IsConfigured)
        {
            return new FeedbackDeliveryRun(0, false);
        }

        var dueIds = await _feedback.GetDueIdsAsync(_timeProvider.GetUtcNow().UtcDateTime, Math.Max(1, _options.BatchSize), cancellationToken);
        var delivered = 0;
        foreach (var id in dueIds)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var outcome = await DeliverAsync(id, cancellationToken);
            _feedback.ClearTracking();
            if (outcome == Outcome.Delivered)
            {
                delivered++;
            }
            else if (outcome == Outcome.TrackerUnavailable)
            {
                return new FeedbackDeliveryRun(delivered, true);
            }
        }

        return new FeedbackDeliveryRun(delivered, false);
    }

    private async Task<Outcome> DeliverAsync(int id, CancellationToken cancellationToken)
    {
        var message = await _feedback.GetForDeliveryAsync(id, cancellationToken);
        if (message is null || message.DeliveryState != FeedbackDeliveryState.Pending)
        {
            return Outcome.Skipped;
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        message.Attempts++;
        message.LastAttemptAtUtc = now;
        message.NextAttemptAtUtc = now + _options.RetryDelay(message.Attempts);
        try
        {
            await _feedback.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Outcome.Skipped;
        }

        var outcome = Outcome.Delivered;
        try
        {
            var issue = message.Attempts > 1
                ? await _tracker.FindByMarkerAsync(
                    FeedbackIssueFormatter.Marker(message.DeliveryKey), message.CreatedAtUtc - MarkerSearchMargin, cancellationToken)
                : null;
            issue ??= await CreateIssueAsync(message, cancellationToken);

            message.DeliveryState = FeedbackDeliveryState.Delivered;
            message.DeliveredAtUtc = _timeProvider.GetUtcNow().UtcDateTime;
            message.GitHubIssueNumber = issue.Number;
            message.GitHubIssueUrl = Truncate(issue.Url, FeedbackMessage.IssueUrlMaxLength);
            message.LastError = null;
        }
        catch (FeedbackTrackerException exception)
        {
            message.LastError = Truncate(exception.Message, FeedbackMessage.LastErrorMaxLength);
            if (exception.Failure == FeedbackTrackerFailure.Rejected)
            {
                message.DeliveryState = FeedbackDeliveryState.Failed;
                outcome = Outcome.Rejected;
                _logger.LogError("Feedback {FeedbackId} was rejected and will not be retried: {Error}", message.Id, exception.Message);
            }
            else
            {
                outcome = Outcome.TrackerUnavailable;
                _logger.LogWarning(
                    "Feedback {FeedbackId} was not delivered (attempt {Attempt}), next try at {NextAttemptAtUtc:o}: {Error}",
                    message.Id,
                    message.Attempts,
                    message.NextAttemptAtUtc,
                    exception.Message);
            }
        }

        // Not cancellable: once the tracker has answered, the answer must reach the row.
        await _feedback.SaveChangesAsync(CancellationToken.None);
        return outcome;
    }

    private async Task<FeedbackIssueRef> CreateIssueAsync(FeedbackMessage message, CancellationToken cancellationToken)
    {
        // The repository is public: only a published article is named.
        var articleTitle = message.Article is { Status: ArticleStatus.Published } article ? article.Title : null;
        var mazhabName = message.Mazhab is null ? null : await _feedback.FindSystemSchoolNameAsync(message.Mazhab, cancellationToken);
        return await _tracker.CreateAsync(
            FeedbackIssueFormatter.Title(message, articleTitle),
            FeedbackIssueFormatter.Body(message, articleTitle, mazhabName),
            FeedbackIssueFormatter.Labels,
            cancellationToken);
    }

    private static string Truncate(string value, int maxLength) => value.Length > maxLength ? value[..maxLength] : value;

    private enum Outcome
    {
        Delivered,
        Skipped,
        Rejected,
        TrackerUnavailable,
    }
}

/// <param name="Delivered">Messages that got their issue in this run.</param>
/// <param name="TrackerUnavailable">The run stopped early because the tracker could not be used.</param>
public sealed record FeedbackDeliveryRun(int Delivered, bool TrackerUnavailable);
