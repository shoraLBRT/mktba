using FluentAssertions;
using Mktba.Application.Configuration;

namespace Mktba.Application.Tests;

public class JwtSigningKeyPolicyTests
{
    private static readonly string StrongKey = new('s', JwtSigningKeyPolicy.MinimumKeyBytes);

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void GivenStrongKey_WhenValidating_ThenAccepts(bool isDevelopment)
    {
        JwtSigningKeyPolicy.Validate(StrongKey, isDevelopment).Should().BeNull();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void GivenBlankKeyInDevelopment_WhenValidating_ThenRejects(string? key)
    {
        JwtSigningKeyPolicy.Validate(key, isDevelopment: true).Should().StartWith("Auth:JwtSigningKey is required.");
    }

    [Fact]
    public void GivenKeyOneByteShortInDevelopment_WhenValidating_ThenRejects()
    {
        var key = new string('s', JwtSigningKeyPolicy.MinimumKeyBytes - 1);

        JwtSigningKeyPolicy.Validate(key, isDevelopment: true).Should().Contain("at least 32 bytes");
    }

    [Fact]
    public void GivenMultiByteKeyOfEnoughBytes_WhenValidating_ThenAccepts()
    {
        // 16 Cyrillic letters are 32 UTF-8 bytes.
        JwtSigningKeyPolicy.Validate(new string('ж', 16), isDevelopment: false).Should().BeNull();
    }

    [Fact]
    public void GivenCommittedPlaceholderKey_WhenValidatingOutsideDevelopment_ThenRejects()
    {
        foreach (var key in JwtSigningKeyPolicy.KnownPlaceholderKeys)
        {
            JwtSigningKeyPolicy.Validate(key, isDevelopment: false).Should().NotBeNull();
        }
    }

    [Fact]
    public void GivenCommittedDevelopmentKey_WhenValidatingInDevelopment_ThenAccepts()
    {
        JwtSigningKeyPolicy.Validate("mktba_DevOnly_SigningKey_ChangeMe_1234567890", isDevelopment: true).Should().BeNull();
    }
}
