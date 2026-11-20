using Microsoft.EntityFrameworkCore;

namespace Mktba.Infrastructure.Data;

/// <summary>
/// X-03 (#65): bringing a database up to date is an explicit step. <see cref="MigrateAsync"/> applies
/// the migrations and seeds the reference data (<see cref="SystemSchoolSeeder"/>); the API runs it at
/// startup only when told to (Development) and otherwise as a separate command
/// (<c>dotnet Mktba.Api.dll --migrate</c>), and <see cref="EnsureUpToDateAsync"/> refuses to serve a
/// database that still has migrations to apply.
/// </summary>
public static class DatabaseMigrator
{
    /// <summary>Applies every pending migration, then seeds the reference data. Safe to run again.</summary>
    public static async Task MigrateAsync(MktbaDbContext context, CancellationToken cancellationToken = default)
    {
        // The API's integration tests run on the InMemory provider, which has no migrations.
        if (context.Database.IsRelational())
        {
            await context.Database.MigrateAsync(cancellationToken);
        }
        else
        {
            await context.Database.EnsureCreatedAsync(cancellationToken);
        }

        await SystemSchoolSeeder.SeedAsync(context);
    }

    /// <summary>
    /// Throws when the database has migrations that are not applied yet (an empty database has all of
    /// them), so the API never serves a schema older than its code. Changes nothing.
    /// </summary>
    public static async Task EnsureUpToDateAsync(MktbaDbContext context, CancellationToken cancellationToken = default)
    {
        if (!context.Database.IsRelational())
        {
            return;
        }

        var pending = (await context.Database.GetPendingMigrationsAsync(cancellationToken)).ToList();
        if (pending.Count > 0)
        {
            throw new InvalidOperationException(
                $"The database has {pending.Count} pending migration(s), the latest {pending[^1]}. "
                + "Apply them first with `dotnet Mktba.Api.dll --migrate` (or set Database:MigrateOnStartup=true).");
        }
    }
}
