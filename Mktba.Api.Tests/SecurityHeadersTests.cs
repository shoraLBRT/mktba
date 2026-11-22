using System.Net;
using FluentAssertions;

namespace Mktba.Api.Tests;

/// <summary>
/// Security headers on API responses (X-06, #160): nosniff, no framing, no referrer and a CSP that
/// loads nothing — on success, on errors, and without replacing a CSP an endpoint set itself.
/// </summary>
public sealed class SecurityHeadersTests
{
    private const string ApiPolicy = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

    [Theory]
    [InlineData("/schools/system", HttpStatusCode.OK)]
    [InlineData("/authors/no-such-author-x06", HttpStatusCode.NotFound)]
    [InlineData("/no-such-endpoint", HttpStatusCode.NotFound)]
    [InlineData("/auth/me", HttpStatusCode.Unauthorized)]
    public async Task EveryResponse_HasSecurityHeaders(string path, HttpStatusCode status)
    {
        await using var factory = new MktbaApiFactory();
        using var response = await factory.CreateClient().GetAsync(path);

        response.StatusCode.Should().Be(status);
        Header(response, "X-Content-Type-Options").Should().Be("nosniff");
        Header(response, "X-Frame-Options").Should().Be("DENY");
        Header(response, "Referrer-Policy").Should().Be("no-referrer");
        Header(response, "Content-Security-Policy").Should().Be(ApiPolicy);
    }

    [Fact]
    public async Task StoredFile_KeepsItsOwnPolicy()
    {
        await using var factory = new MktbaApiFactory();
        var client = factory.CreateClient();
        const string name = "0123456789abcdef0123456789abcdef.webp";
        Directory.CreateDirectory(factory.StorageRoot);
        await File.WriteAllBytesAsync(Path.Combine(factory.StorageRoot, name), [0x52, 0x49, 0x46, 0x46]);

        using var response = await client.GetAsync($"/files/{name}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        Header(response, "Content-Security-Policy").Should().Be("default-src 'none'; sandbox");
        Header(response, "X-Content-Type-Options").Should().Be("nosniff");
        Header(response, "X-Frame-Options").Should().Be("DENY");
    }

    private static string? Header(HttpResponseMessage response, string name) =>
        response.Headers.TryGetValues(name, out var values) || response.Content.Headers.TryGetValues(name, out values)
            ? string.Join(", ", values)
            : null;
}
