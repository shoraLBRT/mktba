using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>
/// F-03 (#68): <c>POST /feedback</c> under abuse — the limit per client, the cap on all visitors
/// together, the trap field, and the client address behind a reverse proxy. Each test starts its
/// own API so the limiter counters never leak between tests.
/// </summary>
public sealed class FeedbackProtectionEndpointTests
{
    private const int ClientLimit = 3;
    private const string Proxy = "10.9.9.9";

    private static readonly object Message = new { type = "Idea", text = "Добавьте тёмную тему." };

    [Fact]
    public async Task GivenClientLimitReached_WhenPostingAgain_ThenReturns429WithCodeAndOtherClientsAreNotAffected()
    {
        await using var factory = CreateFactory();
        var client = CreateClientFromIp(factory, "10.0.0.1");
        for (var i = 0; i < ClientLimit; i++)
        {
            (await client.PostAsJsonAsync("/feedback", Message)).StatusCode.Should().Be(HttpStatusCode.Accepted);
        }

        var limited = await client.PostAsJsonAsync("/feedback", Message);
        var other = await CreateClientFromIp(factory, "10.0.0.2").PostAsJsonAsync("/feedback", Message);

        limited.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
        limited.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");
        limited.Headers.RetryAfter.Should().NotBeNull();
        (await ApiJson.ReadCodeAsync(limited)).Should().Be("too_many_requests");
        other.StatusCode.Should().Be(HttpStatusCode.Accepted);
        (await CountMessagesAsync(factory)).Should().Be(ClientLimit + 1);
    }

    [Fact]
    public async Task GivenClientLimit_WhenInvalidAndTrappedRequestsArrive_ThenTheyCountTowardsIt()
    {
        await using var factory = CreateFactory();
        var client = CreateClientFromIp(factory, "10.0.0.1");
        (await client.PostAsJsonAsync("/feedback", new { type = "Idea", text = " " })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await client.PostAsJsonAsync("/feedback", new { type = "Idea", text = "Спам", website = "x" })).StatusCode.Should().Be(HttpStatusCode.Accepted);
        (await client.PostAsJsonAsync("/feedback", Message)).StatusCode.Should().Be(HttpStatusCode.Accepted);

        var limited = await client.PostAsJsonAsync("/feedback", Message);

        limited.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
    }

    [Fact]
    public async Task GivenTrapFieldFilled_WhenPostingFeedback_ThenAnswerLooksAcceptedAndNothingIsStored()
    {
        await using var factory = CreateFactory();
        var client = CreateClientFromIp(factory, "10.0.0.1");
        var real = await client.PostAsJsonAsync("/feedback", Message);

        var trapped = await client.PostAsJsonAsync("/feedback", new { type = "Idea", text = "Купите ссылки", website = "https://spam.example" });

        trapped.StatusCode.Should().Be(real.StatusCode).And.Be(HttpStatusCode.Accepted);
        trapped.Headers.Select(header => header.Key).Should().BeEquivalentTo(real.Headers.Select(header => header.Key));
        var realId = (await real.Content.ReadFromJsonAsync<FeedbackAcceptedDto>(ApiJson.Options))!.Id;
        var trappedId = (await trapped.Content.ReadFromJsonAsync<FeedbackAcceptedDto>(ApiJson.Options))!.Id;
        trappedId.Should().Be(realId + 1);
        (await CountMessagesAsync(factory)).Should().Be(1);
    }

    [Fact]
    public async Task GivenHourlyCapReached_WhenAnotherClientPosts_ThenReturns429FeedbackLimitReachedWithRetryAfter()
    {
        await using var factory = CreateFactory(("Feedback:Intake:MaxPerHour", "2"));
        (await CreateClientFromIp(factory, "10.0.0.1").PostAsJsonAsync("/feedback", Message)).StatusCode.Should().Be(HttpStatusCode.Accepted);
        (await CreateClientFromIp(factory, "10.0.0.2").PostAsJsonAsync("/feedback", Message)).StatusCode.Should().Be(HttpStatusCode.Accepted);

        var limited = await CreateClientFromIp(factory, "10.0.0.3").PostAsJsonAsync("/feedback", Message);

        limited.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
        limited.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");
        limited.Headers.RetryAfter!.Delta.Should().BeGreaterThan(TimeSpan.FromMinutes(59)).And.BeLessThanOrEqualTo(TimeSpan.FromHours(1));
        (await ApiJson.ReadCodeAsync(limited)).Should().Be("feedback_limit_reached");
        (await CountMessagesAsync(factory)).Should().Be(2);
    }

    [Fact]
    public async Task GivenKnownProxy_WhenVisitorsComeThroughIt_ThenEachVisitorHasItsOwnLimit()
    {
        await using var factory = CreateFactory(("ForwardedHeaders:KnownProxies:0", Proxy));
        var first = CreateClientBehindProxy(factory, Proxy, "203.0.113.1");
        for (var i = 0; i < ClientLimit; i++)
        {
            await first.PostAsJsonAsync("/feedback", Message);
        }

        var limited = await first.PostAsJsonAsync("/feedback", Message);
        var second = await CreateClientBehindProxy(factory, Proxy, "203.0.113.2").PostAsJsonAsync("/feedback", Message);

        limited.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
        second.StatusCode.Should().Be(HttpStatusCode.Accepted);
    }

    [Fact]
    public async Task GivenForwardedHeaderFromAnUnknownSender_WhenPosting_ThenTheHeaderIsIgnored()
    {
        await using var factory = CreateFactory(("ForwardedHeaders:KnownProxies:0", Proxy));
        for (var i = 0; i < ClientLimit; i++)
        {
            await CreateClientBehindProxy(factory, "198.51.100.7", $"203.0.113.{i + 1}").PostAsJsonAsync("/feedback", Message);
        }

        var limited = await CreateClientBehindProxy(factory, "198.51.100.7", "203.0.113.99").PostAsJsonAsync("/feedback", Message);

        limited.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
    }

    [Fact]
    public async Task GivenNoProxyConfigured_WhenForwardedHeaderIsSent_ThenTheSocketAddressIsTheClient()
    {
        await using var factory = CreateFactory();
        for (var i = 0; i < ClientLimit; i++)
        {
            await CreateClientBehindProxy(factory, Proxy, $"203.0.113.{i + 1}").PostAsJsonAsync("/feedback", Message);
        }

        var limited = await CreateClientBehindProxy(factory, Proxy, "203.0.113.99").PostAsJsonAsync("/feedback", Message);

        limited.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
    }

    private static MktbaApiFactory CreateFactory(params (string Key, string Value)[] settings)
    {
        var all = new Dictionary<string, string>
        {
            ["RateLimiting:Feedback:PermitLimit"] = ClientLimit.ToString(),
            ["RateLimiting:Feedback:WindowSeconds"] = "3600",
            ["Feedback:Intake:MaxPerHour"] = "0",
        };
        foreach (var (key, value) in settings)
        {
            all[key] = value;
        }

        return new MktbaApiFactory("Testing", MktbaApiFactory.TestSigningKey, all);
    }

    private static HttpClient CreateClientFromIp(MktbaApiFactory factory, string ip)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(MktbaApiFactory.RemoteIpHeader, ip);
        return client;
    }

    private static HttpClient CreateClientBehindProxy(MktbaApiFactory factory, string socketIp, string forwardedFor)
    {
        var client = CreateClientFromIp(factory, socketIp);
        client.DefaultRequestHeaders.Add("X-Forwarded-For", forwardedFor);
        return client;
    }

    private static async Task<int> CountMessagesAsync(MktbaApiFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<MktbaDbContext>().FeedbackMessages.CountAsync();
    }
}
