using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Mktba.Api.Observability;
using Mktba.Application.Configuration;

namespace Mktba.Api.Tests;

/// <summary>X-05 (#159): which log entries become alerts, and the Telegram request.</summary>
public sealed class AlertTests
{
    private static readonly DateTimeOffset Start = new(2026, 11, 22, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void GivenRepeatsOfOneKind_WhenAdmitting_ThenOnePerWindowAndTheRepeatsAreCountedIntoTheNext()
    {
        var throttle = new AlertThrottle(new AlertOptions { ThrottleMinutes = 30, MaxPerHour = 0 });

        throttle.Admit(Entry(Start)).Should().Be(0);
        throttle.Admit(Entry(Start.AddMinutes(1))).Should().BeNull();
        throttle.Admit(Entry(Start.AddMinutes(29))).Should().BeNull();
        throttle.Admit(Entry(Start.AddMinutes(31))).Should().Be(2);
    }

    [Fact]
    public void GivenDifferentKinds_WhenAdmitting_ThenEachIsSent()
    {
        var throttle = new AlertThrottle(new AlertOptions { ThrottleMinutes = 30, MaxPerHour = 0 });

        throttle.Admit(Entry(Start, template: "A failed.")).Should().Be(0);
        throttle.Admit(Entry(Start, template: "B failed.")).Should().Be(0);
        throttle.Admit(Entry(Start, category: "Other")).Should().Be(0);
        throttle.Admit(Entry(Start, exceptionType: "System.TimeoutException")).Should().Be(0);
    }

    [Fact]
    public void GivenTheHourlyCap_WhenMoreKindsArrive_ThenTheyAreDroppedUntilTheHourPasses()
    {
        var throttle = new AlertThrottle(new AlertOptions { ThrottleMinutes = 0, MaxPerHour = 2 });

        throttle.Admit(Entry(Start, template: "1")).Should().NotBeNull();
        throttle.Admit(Entry(Start.AddMinutes(1), template: "2")).Should().NotBeNull();
        throttle.Admit(Entry(Start.AddMinutes(2), template: "3")).Should().BeNull();
        throttle.Admit(Entry(Start.AddMinutes(60), template: "4")).Should().NotBeNull();
    }

    [Fact]
    public void GivenAnEntry_WhenFormatting_ThenNamesTheStandLevelCategoryTimeAndRepeats()
    {
        var text = AlertWorker.Format("production", Entry(Start, message: "Upload cleanup failed."), repeats: 3);

        text.Should().Be(
            "mktba production: Error in Mktba.Api.Infrastructure.UploadCleanupWorker\n2026-11-22 12:00:00 UTC\n"
            + "Upload cleanup failed.\n(+3 similar since the last alert)");
    }

    [Fact]
    public async Task GivenTelegramSettings_WhenSending_ThenPostsSendMessageToTheChat()
    {
        var handler = new HealthEndpointTests.StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK));
        var channel = new TelegramAlertChannel(new StubHttpClientFactory(handler), Options.Create(new AlertOptions
        {
            Telegram = new TelegramAlertOptions { BotToken = " 123:abc ", ChatId = "-1001", ApiBaseUrl = "https://telegram.test/" },
        }));

        channel.IsConfigured.Should().BeTrue();
        await channel.SendAsync("hello", CancellationToken.None);

        handler.Requests.Should().ContainSingle();
        handler.Requests[0].Method.Should().Be(HttpMethod.Post);
        handler.Requests[0].RequestUri!.ToString().Should().Be("https://telegram.test/bot123:abc/sendMessage");
        using var body = JsonDocument.Parse(handler.Bodies[0]);
        body.RootElement.GetProperty("chat_id").GetString().Should().Be("-1001");
        body.RootElement.GetProperty("text").GetString().Should().Be("hello");
    }

    [Fact]
    public async Task GivenTelegramRefuses_WhenSending_ThenThrowsWithoutTheToken()
    {
        var handler = new HealthEndpointTests.StubHandler(_ => new HttpResponseMessage(HttpStatusCode.Unauthorized));
        var channel = new TelegramAlertChannel(new StubHttpClientFactory(handler), Options.Create(new AlertOptions
        {
            Telegram = new TelegramAlertOptions { BotToken = "123:secret", ChatId = "1" },
        }));

        var send = () => channel.SendAsync("hello", CancellationToken.None);

        (await send.Should().ThrowAsync<HttpRequestException>()).Which.Message.Should().NotContain("secret");
    }

    [Theory]
    [InlineData(null, "1")]
    [InlineData("token", "")]
    [InlineData(" ", " ")]
    public void GivenAMissingTokenOrChat_WhenAsked_ThenNotConfigured(string? token, string? chat)
        => new TelegramAlertOptions { BotToken = token, ChatId = chat }.IsConfigured.Should().BeFalse();

    [Fact]
    public void GivenTheLoggerProvider_WhenLogging_ThenOnlyEntriesAtTheLevelOutsideTheAlertPipelineAreQueued()
    {
        var queue = new AlertQueue();
        using var provider = new AlertLoggerProvider(queue, new HealthEndpointTests.ManualClock(Start), LogLevel.Error);

        provider.CreateLogger("Mktba.Any").LogWarning("Not enough.");
        provider.CreateLogger(typeof(AlertWorker).FullName!).LogError("A failing channel.");
        provider.CreateLogger("Mktba.Any").LogError("Token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl leaked for {Id}.", 7);

        queue.Reader.TryRead(out var entry).Should().BeTrue();
        entry!.Category.Should().Be("Mktba.Any");
        entry.Template.Should().Be("Token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl leaked for {Id}.");
        entry.Message.Should().Be("Token [token] leaked for 7.");
        queue.Reader.TryRead(out _).Should().BeFalse();
    }

    private static AlertEntry Entry(
        DateTimeOffset at,
        string category = "Mktba.Api.Infrastructure.UploadCleanupWorker",
        string template = "Upload cleanup failed.",
        string? exceptionType = null,
        string? message = null)
        => new(at, LogLevel.Error, category, template, message ?? template, exceptionType);

    private sealed class StubHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }
}
