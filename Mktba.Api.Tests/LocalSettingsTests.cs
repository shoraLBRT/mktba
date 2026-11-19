using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Mktba.Api.Infrastructure;

namespace Mktba.Api.Tests;

/// <summary>
/// Regression tests for S-16 (#18): appsettings.json pointed to a gitignored
/// appsettings.local.json that the API never loaded.
/// </summary>
public sealed class LocalSettingsTests : IDisposable
{
    // A unique section keeps the environment variable away from other tests running in parallel.
    private readonly string _section = $"LocalSettingsTests{Guid.NewGuid():N}";
    private readonly string _contentRoot = Directory.CreateTempSubdirectory("mktba-local-settings-").FullName;

    private string Key => $"{_section}:Value";
    private string EnvironmentVariable => $"{_section}__Value";

    [Fact]
    public void GivenLocalFile_WhenBuildingConfiguration_ThenItOverridesCommittedSettingsFiles()
    {
        WriteSettings("appsettings.json", "committed");
        WriteSettings("appsettings.Development.json", "development");
        WriteSettings(LocalSettings.FileName, "local");

        var configuration = CreateBuilder().Configuration.AddLocalSettingsFile();

        configuration[Key].Should().Be("local");
    }

    [Fact]
    public void GivenLocalFileAndEnvironmentVariable_WhenBuildingConfiguration_ThenEnvironmentVariableWins()
    {
        WriteSettings(LocalSettings.FileName, "local");
        Environment.SetEnvironmentVariable(EnvironmentVariable, "environment");

        var configuration = CreateBuilder().Configuration.AddLocalSettingsFile();

        configuration[Key].Should().Be("environment");
    }

    [Fact]
    public void GivenNoLocalFile_WhenBuildingConfiguration_ThenCommittedSettingsApply()
    {
        WriteSettings("appsettings.Development.json", "development");

        var configuration = CreateBuilder().Configuration.AddLocalSettingsFile();

        configuration[Key].Should().Be("development");
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable(EnvironmentVariable, null);
        Directory.Delete(_contentRoot, recursive: true);
    }

    private WebApplicationBuilder CreateBuilder() => WebApplication.CreateBuilder(new WebApplicationOptions
    {
        ContentRootPath = _contentRoot,
        EnvironmentName = "Development",
    });

    private void WriteSettings(string fileName, string value) =>
        File.WriteAllText(Path.Combine(_contentRoot, fileName), $$"""{ "{{_section}}": { "Value": "{{value}}" } }""");
}
