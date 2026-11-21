using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>
/// Regression tests for S-10 (#12): credential and AI endpoints had no request rate limit.
/// Each test starts its own API so the limiter counters never leak between tests.
/// </summary>
public sealed class RateLimitingTests
{
    private const int AuthLimit = 3;
    private const int AiLimit = 2;
    private const int UploadLimit = 2;

    private static readonly object WrongCredentials = new { Email = "nobody@mktba.test", Password = "Wrong-password-1" };

    [Fact]
    public async Task GivenAuthRequestsWithinLimit_WhenLoggingIn_ThenEveryResponseIsNormal()
    {
        await using var factory = CreateFactory();
        var client = CreateClientFromIp(factory, "10.0.0.1");

        for (var i = 0; i < AuthLimit; i++)
        {
            var response = await client.PostAsJsonAsync("/auth/login", WrongCredentials);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
    }

    [Fact]
    public async Task GivenAuthLimitReached_WhenLoggingInAgain_ThenReturns429WithRetryAfter()
    {
        await using var factory = CreateFactory();
        var client = CreateClientFromIp(factory, "10.0.0.1");
        for (var i = 0; i < AuthLimit; i++)
        {
            await client.PostAsJsonAsync("/auth/login", WrongCredentials);
        }

        var response = await client.PostAsJsonAsync("/auth/login", WrongCredentials);

        response.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
        response.Headers.RetryAfter.Should().NotBeNull();
        response.Headers.RetryAfter!.Delta.Should().BePositive();
        (await response.Content.ReadAsStringAsync()).Should().Contain("too_many_requests");
    }

    [Fact]
    public async Task GivenAuthLimitReachedOnLogin_WhenRegisteringFromSameIp_ThenRegisterIsAlsoLimited()
    {
        await using var factory = CreateFactory();
        var client = CreateClientFromIp(factory, "10.0.0.1");
        for (var i = 0; i < AuthLimit; i++)
        {
            await client.PostAsJsonAsync("/auth/login", WrongCredentials);
        }

        var response = await client.PostAsJsonAsync("/auth/register", WrongCredentials);

        response.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
    }

    [Fact]
    public async Task GivenAuthLimitReachedByOneIp_WhenAnotherIpLogsIn_ThenItIsNotLimited()
    {
        await using var factory = CreateFactory();
        var blocked = CreateClientFromIp(factory, "10.0.0.1");
        for (var i = 0; i <= AuthLimit; i++)
        {
            await blocked.PostAsJsonAsync("/auth/login", WrongCredentials);
        }

        var response = await CreateClientFromIp(factory, "10.0.0.2").PostAsJsonAsync("/auth/login", WrongCredentials);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GivenAuthLimitReached_WhenReadingAuthStatus_ThenStatusIsNotLimited()
    {
        await using var factory = CreateFactory();
        var client = CreateClientFromIp(factory, "10.0.0.1");
        for (var i = 0; i <= AuthLimit; i++)
        {
            await client.PostAsJsonAsync("/auth/login", WrongCredentials);
        }

        var response = await client.GetAsync("/auth/status");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GivenAiLimitReachedByOneAdmin_WhenCallingAiAgain_ThenOnlyThatAdminGets429()
    {
        await using var factory = CreateFactory();
        // Both admins share one IP: the AI limit must follow the user, not the address.
        var first = await RegisterFirstAdminAsync(factory);
        var second = await RegisterInvitedAdminAsync(factory, first);
        for (var i = 0; i < AiLimit; i++)
        {
            var allowed = await first.PostAsJsonAsync("/admin/ai-style", new { Text = "" });
            allowed.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        var limited = await first.PostAsJsonAsync("/admin/ai-style", new { Text = "" });
        var otherAdmin = await second.PostAsJsonAsync("/admin/ai-style", new { Text = "" });

        limited.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
        limited.Headers.RetryAfter.Should().NotBeNull();
        otherAdmin.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GivenUploadLimitReachedByOneUser_WhenUploadingAgain_ThenOnlyThatUserGets429()
    {
        await using var factory = CreateFactory();
        // Both users share one IP: the upload limit (U-08, #73) follows the user, not the address.
        var (first, _) = await RoleClients.CreateAsync(factory, UserRole.Reader);
        var (second, _) = await RoleClients.CreateAsync(factory, UserRole.Reader);
        for (var i = 0; i < UploadLimit; i++)
        {
            var allowed = await first.PostAsync("/uploads/avatar", new MultipartFormDataContent());
            allowed.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        var limited = await first.PostAsync("/uploads/avatar", new MultipartFormDataContent());
        var otherUser = await second.PostAsync("/uploads/avatar", new MultipartFormDataContent());

        limited.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
        limited.Headers.RetryAfter.Should().NotBeNull();
        otherUser.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    private static MktbaApiFactory CreateFactory() => new("Testing", MktbaApiFactory.TestSigningKey, new Dictionary<string, string>
    {
        ["RateLimiting:Auth:PermitLimit"] = AuthLimit.ToString(),
        ["RateLimiting:Auth:WindowSeconds"] = "3600",
        ["RateLimiting:Ai:PermitLimit"] = AiLimit.ToString(),
        ["RateLimiting:Ai:WindowSeconds"] = "3600",
        ["RateLimiting:Uploads:PermitLimit"] = UploadLimit.ToString(),
        ["RateLimiting:Uploads:WindowSeconds"] = "3600",
    });

    private static HttpClient CreateClientFromIp(MktbaApiFactory factory, string ip)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(MktbaApiFactory.RemoteIpHeader, ip);
        return client;
    }

    private static async Task<HttpClient> RegisterFirstAdminAsync(MktbaApiFactory factory)
    {
        var client = CreateClientFromIp(factory, "10.0.0.9");
        var response = await client.PostAsJsonAsync("/auth/register", new { Email = "first@mktba.test", Password = "Test-password-1" });
        var auth = await response.Content.ReadFromJsonAsync<AdminAuthResponseDto>(ApiJson.Options);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.AccessToken);
        return client;
    }

    private static async Task<HttpClient> RegisterInvitedAdminAsync(MktbaApiFactory factory, HttpClient inviter)
    {
        var inviteResponse = await inviter.PostAsJsonAsync("/invites/", new { Role = "Admin" });
        var invite = await inviteResponse.Content.ReadFromJsonAsync<InviteCreatedDto>(ApiJson.Options);
        var client = CreateClientFromIp(factory, "10.0.0.9");
        var response = await client.PostAsJsonAsync("/auth/register", new
        {
            Email = "second@mktba.test",
            Password = "Test-password-1",
            InviteToken = invite!.Token,
        });
        var auth = await response.Content.ReadFromJsonAsync<AdminAuthResponseDto>(ApiJson.Options);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.AccessToken);
        return client;
    }
}
