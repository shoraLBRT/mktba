using FluentAssertions;
using Mktba.Application.Configuration;

namespace Mktba.Api.Tests;

/// <summary>
/// Regression tests for S-09 (#11): a JWT signing key committed to appsettings.json let the API
/// start with a public key in any environment.
/// </summary>
public sealed class JwtSigningKeyStartupTests
{
    private const string CommittedPlaceholderKey = "mktba_DevOnly_SigningKey_ChangeMe_1234567890";

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public void GivenNonDevelopmentAndCommittedPlaceholderKey_WhenStarting_ThenFailsWithPlaceholderMessage(string environment)
    {
        using var factory = new MktbaApiFactory(environment, CommittedPlaceholderKey);

        var start = () => factory.CreateClient();

        start.Should().Throw<InvalidOperationException>()
            .WithMessage("*Auth:JwtSigningKey is a placeholder*Auth__JwtSigningKey*");
    }

    [Fact]
    public void GivenNonDevelopmentAndShortKey_WhenStarting_ThenFailsWithMinimumLengthMessage()
    {
        using var factory = new MktbaApiFactory("Production", new string('k', JwtSigningKeyPolicy.MinimumKeyBytes - 1));

        var start = () => factory.CreateClient();

        start.Should().Throw<InvalidOperationException>()
            .WithMessage("*at least 32 bytes*");
    }

    [Fact]
    public void GivenNonDevelopmentAndNoKey_WhenStarting_ThenFailsWithRequiredMessage()
    {
        using var factory = new MktbaApiFactory("Production", signingKey: null);

        var start = () => factory.CreateClient();

        start.Should().Throw<InvalidOperationException>()
            .WithMessage("Auth:JwtSigningKey is required.*");
    }

    [Fact]
    public async Task GivenNonDevelopmentAndStrongKey_WhenStarting_ThenServesRequests()
    {
        using var factory = new MktbaApiFactory("Production", MktbaApiFactory.TestSigningKey);
        var client = factory.CreateClient();

        var response = await client.GetAsync("/auth/status");

        response.IsSuccessStatusCode.Should().BeTrue();
    }

    [Fact]
    public async Task GivenDevelopmentAndCommittedPlaceholderKey_WhenStarting_ThenServesRequests()
    {
        using var factory = new MktbaApiFactory("Development", CommittedPlaceholderKey);
        var client = factory.CreateClient();

        var response = await client.GetAsync("/auth/status");

        response.IsSuccessStatusCode.Should().BeTrue();
    }
}
