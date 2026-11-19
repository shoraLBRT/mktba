using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.Services.Feedback;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>
/// F-02 (#67): the background worker inside the running API, with a stand-in tracker — from
/// <c>POST /feedback</c> to a delivered row, through one failed attempt.
/// </summary>
public sealed class FeedbackDeliveryWorkerTests
{
    private static readonly IReadOnlyDictionary<string, string> FastDelivery = new Dictionary<string, string>
    {
        ["Feedback:Delivery:PollIntervalSeconds"] = "1",
        ["Feedback:Delivery:RetryBaseSeconds"] = "1",
    };

    [Fact]
    public async Task GivenTrackerDownAtFirst_WhenFeedbackIsPosted_ThenCallerGets202AndWorkerDeliversOnceTrackerIsBack()
    {
        var tracker = new FlakyTracker();
        await using var factory = new MktbaApiFactory("Testing", MktbaApiFactory.TestSigningKey, FastDelivery) { IssueTracker = tracker };

        var response = await factory.CreateClient().PostAsJsonAsync("/feedback", new { type = "Idea", text = "Добавьте закладки", contact = "never@published.test" });

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);
        var delivered = await WaitForAsync(factory, f => f.DeliveryState == FeedbackDeliveryState.Delivered);
        delivered.GitHubIssueNumber.Should().Be(1);
        delivered.Attempts.Should().Be(2);
        delivered.LastError.Should().BeNull();
        tracker.Bodies.Should().ContainSingle().Which.Should().Contain("Добавьте закладки").And.NotContain("never@published.test");
    }

    private static async Task<FeedbackMessage> WaitForAsync(MktbaApiFactory factory, Func<FeedbackMessage, bool> reached)
    {
        var watch = Stopwatch.StartNew();
        while (true)
        {
            using var scope = factory.Services.CreateScope();
            var row = await scope.ServiceProvider.GetRequiredService<MktbaDbContext>().FeedbackMessages.AsNoTracking().SingleAsync();
            if (reached(row))
            {
                return row;
            }

            if (watch.Elapsed > TimeSpan.FromSeconds(30))
            {
                throw new TimeoutException($"The worker did not deliver: state {row.DeliveryState}, attempts {row.Attempts}, error {row.LastError}.");
            }

            await Task.Delay(200);
        }
    }

    /// <summary>Fails the first creation as an outage, then creates issues.</summary>
    private sealed class FlakyTracker : IFeedbackIssueTracker
    {
        private int _calls;

        public bool IsConfigured => true;

        public List<string> Bodies { get; } = [];

        public Task<FeedbackIssueRef?> FindByMarkerAsync(string marker, DateTime sinceUtc, CancellationToken cancellationToken)
            => Task.FromResult<FeedbackIssueRef?>(null);

        public Task<FeedbackIssueRef> CreateAsync(string title, string body, IReadOnlyList<string> labels, CancellationToken cancellationToken)
        {
            if (Interlocked.Increment(ref _calls) == 1)
            {
                throw new FeedbackTrackerException(FeedbackTrackerFailure.Unavailable, "GitHub create issue: HTTP 503");
            }

            Bodies.Add(body);
            return Task.FromResult(new FeedbackIssueRef(Bodies.Count, "https://github.test/issues/1"));
        }
    }
}
