using Microsoft.EntityFrameworkCore;
using Mktba.Application.Services.Verification;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Infrastructure;

/// <summary>
/// X-03 (#65): what the API does to its database before serving. With <c>Database:MigrateOnStartup</c>
/// (on in <c>appsettings.Development.json</c>, off everywhere else) it migrates and seeds the reference
/// data itself; otherwise it only checks that no migration is pending and refuses to start if one is.
/// Migrations are then applied by the same binary run with <see cref="MigrateSwitch"/>, which migrates,
/// seeds and exits without serving — the step a deployment runs before starting the new version.
/// </summary>
public static class DatabaseStartup
{
    public const string MigrateSwitch = "--migrate";
    public const string MigrateOnStartupKey = "Database:MigrateOnStartup";

    /// <summary>
    /// Whether <paramref name="args"/> ask for the migration command, and the arguments without the
    /// switch (the host's command-line configuration would otherwise read it as a key taking the next
    /// argument as its value).
    /// </summary>
    public static (bool MigrateOnly, string[] HostArgs) ParseArgs(string[] args)
    {
        var hostArgs = args.Where(a => !string.Equals(a, MigrateSwitch, StringComparison.OrdinalIgnoreCase)).ToArray();
        return (hostArgs.Length != args.Length, hostArgs);
    }

    /// <summary>The <see cref="MigrateSwitch"/> command: migrate, seed the reference data, fill derived data, done.</summary>
    public static async Task MigrateAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(DatabaseStartup));

        await DatabaseMigrator.MigrateAsync(context);
        var fingerprinted = await ReviewFingerprintBackfill.RunAsync(context);
        logger.LogInformation(
            "Database is up to date: migrations applied, reference data seeded, {Count} revisions fingerprinted.", fingerprinted);
    }

    /// <summary>Run before the API serves: migrate when configured to, otherwise check the schema.</summary>
    public static async Task PrepareAsync(IServiceProvider services, IConfiguration configuration)
    {
        using var scope = services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();

        // The InMemory provider of the integration tests starts empty in every environment.
        if (configuration.GetValue<bool>(MigrateOnStartupKey) || !context.Database.IsRelational())
        {
            await DatabaseMigrator.MigrateAsync(context);
        }
        else
        {
            await DatabaseMigrator.EnsureUpToDateAsync(context);
        }

        // Revisions written by a version before V-05 (#121) — or by the previous version still serving
        // while this one was migrated — get their review fingerprints.
        await ReviewFingerprintBackfill.RunAsync(context);
    }
}
