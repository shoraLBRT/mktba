using FluentAssertions;
using Mktba.Api.Infrastructure;

namespace Mktba.Api.Tests;

/// <summary>X-03 (#65): the <c>--migrate</c> command switch.</summary>
public class DatabaseStartupTests
{
    [Fact]
    public void GivenMigrateSwitch_WhenParsingArgs_ThenMigratesOnlyAndHostDoesNotSeeTheSwitch()
    {
        var (migrateOnly, hostArgs) = DatabaseStartup.ParseArgs(["--migrate", "--environment", "Production"]);

        migrateOnly.Should().BeTrue();
        hostArgs.Should().Equal("--environment", "Production");
    }

    [Fact]
    public void GivenNoSwitch_WhenParsingArgs_ThenServesWithTheSameArgs()
    {
        var (migrateOnly, hostArgs) = DatabaseStartup.ParseArgs(["--urls", "http://localhost:5172"]);

        migrateOnly.Should().BeFalse();
        hostArgs.Should().Equal("--urls", "http://localhost:5172");
    }

    [Fact]
    public void GivenSwitchAsAValue_WhenParsingArgs_ThenOnlyTheExactSwitchCounts()
    {
        var (migrateOnly, hostArgs) = DatabaseStartup.ParseArgs(["--migrate=false"]);

        migrateOnly.Should().BeFalse();
        hostArgs.Should().Equal("--migrate=false");
    }
}
