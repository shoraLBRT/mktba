using Microsoft.Extensions.Configuration.Json;

namespace Mktba.Api.Infrastructure;

/// <summary>
/// Optional, gitignored <c>appsettings.local.json</c> in the content root for machine-specific
/// settings (S-16, #18), such as a local connection string.
/// </summary>
public static class LocalSettings
{
    public const string FileName = "appsettings.local.json";

    /// <summary>
    /// Adds <see cref="FileName"/> right after the last JSON settings file the host loaded
    /// (<c>appsettings.{Environment}.json</c>), so it overrides the committed files while user
    /// secrets, environment variables and command-line arguments still override it.
    /// </summary>
    public static ConfigurationManager AddLocalSettingsFile(this ConfigurationManager configuration)
    {
        var sources = configuration.Sources;
        var lastJsonFile = -1;
        for (var i = 0; i < sources.Count; i++)
        {
            if (sources[i] is JsonConfigurationSource { Path: not null } json
                && json.Path.StartsWith("appsettings.", StringComparison.OrdinalIgnoreCase))
            {
                lastJsonFile = i;
            }
        }

        // No file provider: the source takes the builder's, which points at the content root.
        sources.Insert(lastJsonFile + 1, new JsonConfigurationSource { Path = FileName, Optional = true, ReloadOnChange = true });
        return configuration;
    }
}
