using FluentAssertions;

namespace Mktba.Api.Tests;

/// <summary>
/// CORS for the production site (X-01, #63): the origins in <c>Cors:AllowedOrigins</c> and loopback
/// may call the API with credentials (the refresh cookie); any other origin gets no CORS headers.
/// </summary>
public sealed class CorsTests
{
    private const string SiteOrigin = "https://mktba.ru";

    [Theory]
    [InlineData(SiteOrigin)]
    [InlineData("http://localhost:5173")]
    [InlineData("http://127.0.0.1:5173")]
    public async Task Preflight_FromAllowedOrigin_AllowsCredentials(string origin)
    {
        await using var factory = CreateFactory(("Cors:AllowedOrigins:0", SiteOrigin + "/"));
        using var response = await factory.CreateClient().SendAsync(Preflight(origin));

        response.Headers.GetValues("Access-Control-Allow-Origin").Should().ContainSingle().Which.Should().Be(origin);
        response.Headers.GetValues("Access-Control-Allow-Credentials").Should().ContainSingle().Which.Should().Be("true");
    }

    [Theory]
    [InlineData("https://evil.example")]
    [InlineData("https://mktba.ru.evil.example")]
    [InlineData("http://mktba.ru")]
    [InlineData("https://staging.mktba.ru")]
    public async Task Preflight_FromOtherOrigin_HasNoCorsHeaders(string origin)
    {
        await using var factory = CreateFactory(("Cors:AllowedOrigins:0", SiteOrigin));
        using var response = await factory.CreateClient().SendAsync(Preflight(origin));

        response.Headers.Contains("Access-Control-Allow-Origin").Should().BeFalse();
    }

    [Fact]
    public async Task Preflight_WithoutConfiguredOrigins_AllowsOnlyLoopback()
    {
        await using var factory = new MktbaApiFactory();
        var client = factory.CreateClient();

        using var site = await client.SendAsync(Preflight(SiteOrigin));
        using var local = await client.SendAsync(Preflight("http://localhost:5173"));

        site.Headers.Contains("Access-Control-Allow-Origin").Should().BeFalse();
        local.Headers.Contains("Access-Control-Allow-Origin").Should().BeTrue();
    }

    [Theory]
    [InlineData("mktba.ru")]
    [InlineData("https://mktba.ru/app")]
    [InlineData("ftp://mktba.ru")]
    public async Task Startup_WithInvalidOrigin_Fails(string origin)
    {
        await using var factory = CreateFactory(("Cors:AllowedOrigins:0", origin));

        var start = () => factory.CreateClient();

        start.Should().Throw<InvalidOperationException>().WithMessage("*Cors:AllowedOrigins*");
    }

    private static HttpRequestMessage Preflight(string origin)
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/auth/refresh");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "x-requested-with");
        return request;
    }

    private static MktbaApiFactory CreateFactory(params (string Key, string Value)[] settings) =>
        new("Testing", MktbaApiFactory.TestSigningKey, settings.ToDictionary(s => s.Key, s => s.Value));
}
