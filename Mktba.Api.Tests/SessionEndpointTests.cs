using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>
/// U-03 (#31): the refresh-token cookie, rotation, reuse detection, CSRF guard, sign-out on one
/// device and on all, and that ended sessions end their access tokens too.
/// </summary>
public sealed class SessionEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public SessionEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenALogin_WhenTheResponseArrives_ThenItSetsAnHttpOnlySecureStrictCookieScopedToAuth()
    {
        var (email, _) = await RoleClients.CreateUserAsync(_factory, UserRole.Admin);
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), HandleCookies = false });

        var response = await client.PostAsJsonAsync("/auth/login", new { Email = email, RoleClients.Password });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var cookie = response.Headers.GetValues("Set-Cookie").Single(value => value.StartsWith("mktba_refresh="));
        cookie.Should().ContainEquivalentOf("httponly")
            .And.ContainEquivalentOf("secure")
            .And.ContainEquivalentOf("samesite=strict")
            .And.ContainEquivalentOf("path=/auth")
            .And.ContainEquivalentOf("expires=");
        (await response.Content.ReadAsStringAsync()).Should().NotContain(cookie.Split(';')[0]["mktba_refresh=".Length..]);
    }

    [Fact]
    public async Task GivenTheDevelopmentEnvironment_WhenLoggingIn_ThenTheCookieIsNotSecureSoItWorksOverLocalHttp()
    {
        await using var factory = new MktbaApiFactory("Development", MktbaApiFactory.TestSigningKey);
        var (email, _) = await RoleClients.CreateUserAsync(factory, UserRole.Admin);
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });

        var response = await client.PostAsJsonAsync("/auth/login", new { Email = email, RoleClients.Password });

        var cookie = response.Headers.GetValues("Set-Cookie").Single(value => value.StartsWith("mktba_refresh="));
        cookie.Should().ContainEquivalentOf("httponly").And.NotContainEquivalentOf("secure");
    }

    [Fact]
    public async Task GivenASignedInDevice_WhenRefreshing_ThenANewAccessTokenWorksAndTheCookieIsRotated()
    {
        var device = await Device.SignInAsync(_factory);
        var firstCookie = device.RefreshCookie();

        var response = await device.RefreshAsync();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var auth = await response.Content.ReadFromJsonAsync<AdminAuthResponseDto>(ApiJson.Options);
        device.UseAccessToken(auth!.AccessToken);
        device.RefreshCookie().Should().NotBe(firstCookie);
        (await device.Client.GetAsync("/auth/me")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GivenARefreshWithoutTheCsrfHeader_WhenSent_ThenForbiddenAndTheTokenIsNotSpent()
    {
        var device = await Device.SignInAsync(_factory);
        var cookie = device.RefreshCookie();

        var response = await device.Client.PostAsync("/auth/refresh", null);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("session_csrf_header_missing");
        device.RefreshCookie().Should().Be(cookie);
        (await device.RefreshAsync()).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GivenNoCookie_WhenRefreshing_ThenUnauthorizedWithSessionInvalid()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        using var request = new HttpRequestMessage(HttpMethod.Post, "/auth/refresh");
        request.Headers.Add("X-Requested-With", "mktba");

        var response = await client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("session_invalid");
    }

    [Fact]
    public async Task GivenARotatedTokenPresentedAgain_WhenRefreshing_ThenTheSessionEndsWithItsNewTokensAndAccessTokens()
    {
        var device = await Device.SignInAsync(_factory);
        var stolenCookie = device.RefreshCookie();
        var refreshed = await device.RefreshAsync();
        device.UseAccessToken((await refreshed.Content.ReadFromJsonAsync<AdminAuthResponseDto>(ApiJson.Options))!.AccessToken);
        var thief = Device.WithCookie(_factory, stolenCookie);

        var reuse = await thief.RefreshAsync();

        reuse.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await device.RefreshAsync()).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await device.Client.GetAsync("/auth/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GivenAnExpiredRefreshToken_WhenRefreshing_ThenUnauthorizedAndTheCookieIsCleared()
    {
        var device = await Device.SignInAsync(_factory);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
            db.RefreshSessions.Where(s => s.UserId == device.UserId).ToList()
                .ForEach(s => s.ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-1));
            await db.SaveChangesAsync();
        }

        var response = await device.RefreshAsync();

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        response.Headers.GetValues("Set-Cookie").Should().Contain(value => value.StartsWith("mktba_refresh=;"));
    }

    [Fact]
    public async Task GivenASignedInDevice_WhenLoggingOut_ThenTheCookieIsClearedAndNeitherTokenWorks()
    {
        var device = await Device.SignInAsync(_factory);
        var cookie = device.RefreshCookie();

        var response = await device.SendWithCsrfHeaderAsync("/auth/logout");

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        device.RefreshCookie().Should().BeNull();
        (await device.Client.GetAsync("/auth/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await Device.WithCookie(_factory, cookie!).RefreshAsync()).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GivenTwoDevices_WhenOneLogsOutEverywhere_ThenTheOtherDevicesAccessAndRefreshTokensStopWorking()
    {
        var (email, _) = await RoleClients.CreateUserAsync(_factory, UserRole.Admin);
        var laptop = await Device.SignInAsync(_factory, email);
        var phone = await Device.SignInAsync(_factory, email);
        (await phone.Client.GetAsync("/users")).StatusCode.Should().Be(HttpStatusCode.OK);

        var response = await laptop.Client.PostAsync("/auth/logout-all", null);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await phone.Client.GetAsync("/users")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await phone.RefreshAsync()).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await laptop.Client.GetAsync("/auth/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GivenTwoDevices_WhenOneEndsTheOthersSession_ThenOnlyTheOtherIsSignedOut()
    {
        var (email, _) = await RoleClients.CreateUserAsync(_factory, UserRole.Reader);
        var laptop = await Device.SignInAsync(_factory, email);
        var phone = await Device.SignInAsync(_factory, email);

        var sessions = await laptop.Client.GetFromJsonAsync<List<SessionDto>>("/auth/sessions", ApiJson.Options);
        sessions.Should().HaveCount(2);
        sessions!.Should().ContainSingle(s => s.IsCurrent);
        var phoneSession = sessions.Single(s => !s.IsCurrent);

        var response = await laptop.Client.DeleteAsync($"/auth/sessions/{phoneSession.Id}");

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await phone.Client.GetAsync("/auth/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await laptop.Client.GetAsync("/auth/me")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await laptop.Client.DeleteAsync($"/auth/sessions/{phoneSession.Id}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GivenAnAccessTokenWithoutASession_WhenCallingAProtectedEndpoint_ThenUnauthorized()
    {
        var (_, userId) = await RoleClients.CreateUserAsync(_factory, UserRole.Admin);
        var handler = new JwtSecurityTokenHandler();
        var token = handler.WriteToken(handler.CreateToken(new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[]
            {
                new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
                new Claim(ClaimTypes.Role, nameof(UserRole.Admin)),
            }),
            Expires = DateTime.UtcNow.AddMinutes(15),
            Issuer = "mktba",
            Audience = "mktba.admin",
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(MktbaApiFactory.TestSigningKey)),
                SecurityAlgorithms.HmacSha256Signature),
        }));
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        (await client.GetAsync("/auth/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    /// <summary>One browser: a cookie jar over https plus the access token it holds in memory.</summary>
    private sealed class Device
    {
        private static readonly Uri BaseAddress = new("https://localhost");

        private readonly CookieContainer _cookies;

        private Device(HttpClient client, CookieContainer cookies, int userId)
        {
            Client = client;
            _cookies = cookies;
            UserId = userId;
        }

        public HttpClient Client { get; }

        public int UserId { get; }

        public static async Task<Device> SignInAsync(MktbaApiFactory factory, string? email = null)
        {
            var userId = 0;
            if (email is null)
            {
                (email, userId) = await RoleClients.CreateUserAsync(factory, UserRole.Admin);
            }

            var device = Create(factory, userId);
            var login = await device.Client.PostAsJsonAsync("/auth/login", new { Email = email, RoleClients.Password });
            login.EnsureSuccessStatusCode();
            device.UseAccessToken((await login.Content.ReadFromJsonAsync<AdminAuthResponseDto>(ApiJson.Options))!.AccessToken);
            return device;
        }

        public static Device WithCookie(MktbaApiFactory factory, string cookieValue)
        {
            var device = Create(factory, 0);
            device._cookies.Add(BaseAddress, new Cookie("mktba_refresh", cookieValue, "/auth"));
            return device;
        }

        public string? RefreshCookie()
            => _cookies.GetCookies(new Uri(BaseAddress, "/auth/refresh")).FirstOrDefault(c => c.Name == "mktba_refresh")?.Value;

        public void UseAccessToken(string token)
            => Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        public Task<HttpResponseMessage> RefreshAsync() => SendWithCsrfHeaderAsync("/auth/refresh");

        public Task<HttpResponseMessage> SendWithCsrfHeaderAsync(string path)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, path);
            request.Headers.Add("X-Requested-With", "mktba");
            return Client.SendAsync(request);
        }

        private static Device Create(MktbaApiFactory factory, int userId)
        {
            var cookies = new CookieContainer();
            var client = factory.CreateDefaultClient(BaseAddress, new CookieHandler(cookies));
            return new Device(client, cookies, userId);
        }
    }

    /// <summary>Keeps cookies like a browser; TestServer's own handler would hide them from the test.</summary>
    private sealed class CookieHandler(CookieContainer cookies) : DelegatingHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var header = cookies.GetCookieHeader(request.RequestUri!);
            if (!string.IsNullOrEmpty(header))
            {
                request.Headers.Add("Cookie", header);
            }

            var response = await base.SendAsync(request, cancellationToken);
            if (response.Headers.TryGetValues("Set-Cookie", out var setCookies))
            {
                foreach (var setCookie in setCookies)
                {
                    cookies.SetCookies(request.RequestUri!, setCookie);
                }
            }

            return response;
        }
    }
}
