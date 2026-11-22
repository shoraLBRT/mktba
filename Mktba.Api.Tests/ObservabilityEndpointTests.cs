using System.Net;
using System.Net.Http.Json;
using System.Text;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Mktba.Api.Observability;
using Mktba.Application.Services.Observability;

namespace Mktba.Api.Tests;

/// <summary>X-05 (#159): browser error intake, the request log line and alerts, end to end through the API.</summary>
public sealed class ObservabilityEndpointTests
{
    [Fact]
    public async Task GivenABrowserErrorReport_WhenPosted_ThenAccepted202AndLoggedWithoutPersonalData()
    {
        var logs = new CapturingLoggerProvider();
        await using var factory = new MktbaApiFactory { Logs = logs };

        var response = await factory.CreateClient().PostAsJsonAsync("/client-errors", new
        {
            kind = "rejection",
            message = "Request failed for reader@example.com",
            stack = "TypeError: x is undefined\n    at load (https://mktba.ru/assets/app.js?v=1#frag:1:20)",
            page = "https://mktba.ru/search?q=secret+phrase#results",
        });

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);
        var entry = logs.Entries.Should().ContainSingle(e => e.Category == ClientErrorService.LogCategory).Subject;
        entry.Level.Should().Be(LogLevel.Warning);
        entry.Value("Kind").Should().Be("rejection");
        entry.Value("Page").Should().Be("/search");
        entry.Value("ErrorMessage").Should().Be("Request failed for [email]");
        entry.Value("Stack").Should().Be("TypeError: x is undefined\n    at load (https://mktba.ru/assets/app.js)");
        entry.Message.Should().NotContain("secret").And.NotContain("reader@example.com").And.NotContain("v=1");
    }

    [Fact]
    public async Task GivenAnEmptyOrStrangeReport_WhenPosted_ThenStillAcceptedWithDefaults()
    {
        var logs = new CapturingLoggerProvider();
        await using var factory = new MktbaApiFactory { Logs = logs };

        var response = await factory.CreateClient().PostAsJsonAsync("/client-errors", new { kind = "<script>", page = "javascript:alert(1)" });

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);
        var entry = logs.Entries.Should().ContainSingle(e => e.Category == ClientErrorService.LogCategory).Subject;
        entry.Value("Kind").Should().Be("error");
        entry.Value("Page").Should().Be("(unknown page)");
        entry.Value("ErrorMessage").Should().Be("(no message)");
    }

    [Fact]
    public async Task GivenABodyThatIsNotJson_WhenPosted_ThenBadRequestProblem()
    {
        await using var factory = new MktbaApiFactory();

        var response = await factory.CreateClient().PostAsync(
            "/client-errors", new StringContent("{not json", Encoding.UTF8, "application/json"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await response.Content.ReadAsStringAsync()).Should().Contain("bad_request");
    }

    [Fact]
    public async Task GivenTheClientLimitReached_WhenPostingAgain_ThenTooManyRequests()
    {
        await using var factory = new MktbaApiFactory("Testing", MktbaApiFactory.TestSigningKey, new Dictionary<string, string>
        {
            ["RateLimiting:ClientErrors:PermitLimit"] = "2",
            ["RateLimiting:ClientErrors:WindowSeconds"] = "3600",
        });
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(MktbaApiFactory.RemoteIpHeader, "10.0.0.7");
        for (var i = 0; i < 2; i++)
        {
            (await client.PostAsJsonAsync("/client-errors", new { message = "boom" })).StatusCode.Should().Be(HttpStatusCode.Accepted);
        }

        var response = await client.PostAsJsonAsync("/client-errors", new { message = "boom" });

        response.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
        (await response.Content.ReadAsStringAsync()).Should().Contain("too_many_requests");
    }

    [Fact]
    public async Task GivenTheOverallCapReached_WhenPostingAgain_ThenAcceptedButNotLogged()
    {
        var logs = new CapturingLoggerProvider();
        await using var factory = new MktbaApiFactory("Testing", MktbaApiFactory.TestSigningKey, new Dictionary<string, string>
        {
            ["RateLimiting:ClientErrors:PermitLimit"] = "100",
            ["ClientErrors:MaxPerMinute"] = "1",
        })
        { Logs = logs };
        var client = factory.CreateClient();

        await client.PostAsJsonAsync("/client-errors", new { message = "first" });
        var response = await client.PostAsJsonAsync("/client-errors", new { message = "second" });

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);
        // The two posts may straddle a minute boundary: at most one per minute is logged.
        logs.Entries.Count(e => e.Category == ClientErrorService.LogCategory).Should().BeInRange(1, 2);
        logs.Entries.Where(e => e.Category == ClientErrorService.LogCategory)
            .Select(e => e.Value("ErrorMessage")).Should().Contain("first");
    }

    [Fact]
    public async Task GivenARequest_WhenServed_ThenOneLineWithTheRouteTemplateAndNoQueryOrPath()
    {
        var logs = new CapturingLoggerProvider();
        await using var factory = new MktbaApiFactory { Logs = logs };
        var client = factory.CreateClient();

        await client.GetAsync("/schools/system?q=secret-phrase");
        await client.GetAsync("/articles/by-slug/no-such-article-xyz/content");
        await client.GetAsync("/nowhere/secret-path");
        await client.GetAsync("/health/live");

        var lines = logs.Entries.Where(e => e.Category == typeof(RequestLoggingMiddleware).FullName).ToList();
        lines.Should().HaveCount(3);
        lines.Select(e => e.Value("Route")).Should().Equal("/schools/system", "/articles/by-slug/{slug}/content", RequestLoggingMiddleware.UnmatchedRoute);
        lines.Select(e => e.Value("StatusCode")).Should().Equal(200, 404, 404);
        lines.Should().OnlyContain(e => e.Value("TraceId") != null && e.Level == LogLevel.Information);
        string.Join("\n", lines.Select(e => e.Message)).Should().NotContain("secret").And.NotContain("no-such-article-xyz");
    }

    [Fact]
    public async Task GivenAlertsConfigured_WhenAnErrorIsLogged_ThenTheChannelGetsOneRedactedMessageAndRepeatsAreThrottled()
    {
        var channel = new RecordingAlertChannel();
        await using var factory = new MktbaApiFactory("Testing", MktbaApiFactory.TestSigningKey, new Dictionary<string, string>
        {
            ["Alerts:Telegram:BotToken"] = "test-token",
            ["Alerts:Telegram:ChatId"] = "42",
            ["Alerts:Stand"] = "staging",
        })
        { AlertChannel = channel };
        factory.CreateClient();
        var logger = factory.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Mktba.Tests.Alerts");

        logger.LogError(new InvalidOperationException("broken for admin@example.com"), "Run {Run} failed.", 1);
        logger.LogError(new InvalidOperationException("broken again"), "Run {Run} failed.", 2);
        logger.LogWarning("Only a warning.");

        // Other entries (a background worker on the InMemory database) may be sent too: look at this category only.
        var message = await channel.FirstAsync(text => text.Contains("Mktba.Tests.Alerts"));
        message.Should().StartWith("mktba staging: Error in Mktba.Tests.Alerts");
        message.Should().Contain("Run 1 failed.").And.Contain("InvalidOperationException: broken for [email]");
        await Task.Delay(300);
        channel.Messages.Should().ContainSingle(text => text.Contains("Mktba.Tests.Alerts"));
    }

    [Fact]
    public async Task GivenAlertsNotConfigured_WhenStarting_ThenNoAlertLoggerIsRegistered()
    {
        await using var factory = new MktbaApiFactory();
        factory.CreateClient();

        factory.Services.GetServices<ILoggerProvider>().Should().NotContain(provider => provider is AlertLoggerProvider);
    }

    private sealed class RecordingAlertChannel : IAlertChannel
    {
        private readonly List<string> _messages = [];

        public bool IsConfigured => true;

        public IReadOnlyList<string> Messages
        {
            get
            {
                lock (_messages)
                {
                    return _messages.ToList();
                }
            }
        }

        public Task SendAsync(string text, CancellationToken cancellationToken)
        {
            lock (_messages)
            {
                _messages.Add(text);
            }

            return Task.CompletedTask;
        }

        public async Task<string> FirstAsync(Func<string, bool> match)
        {
            var deadline = DateTime.UtcNow.AddSeconds(10);
            while (DateTime.UtcNow < deadline)
            {
                if (Messages.FirstOrDefault(match) is { } found)
                {
                    return found;
                }

                await Task.Delay(20);
            }

            throw new TimeoutException("No matching alert was sent.");
        }
    }
}
