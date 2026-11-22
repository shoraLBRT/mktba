using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Mktba.Infrastructure.Data;

namespace Mktba.Application.Tests;

/// <summary>
/// X-03 (#65): the explicit migration step and the startup check, against a real PostgreSQL. Each test
/// starts from an empty database of its own (<see cref="PostgresDatabaseFixture.Empty"/>).
/// </summary>
public class DatabaseMigratorTests
{
    [Fact]
    public async Task GivenEmptyDatabase_WhenCheckingIt_ThenRefusesAndNamesTheMigrateCommand()
    {
        await WithEmptyDatabaseAsync(async database =>
        {
            await using var context = database.CreateContext();

            var check = () => DatabaseMigrator.EnsureUpToDateAsync(context);

            await check.Should().ThrowAsync<InvalidOperationException>().WithMessage("*pending migration*--migrate*");
        });
    }

    [Fact]
    public async Task GivenEmptyDatabase_WhenListingPendingMigrations_ThenAllAreListedUntilMigrated()
    {
        await WithEmptyDatabaseAsync(async database =>
        {
            await using (var context = database.CreateContext())
            {
                var pending = await DatabaseMigrator.GetPendingMigrationsAsync(context);
                pending.Should().Equal(context.Database.GetMigrations());
                await DatabaseMigrator.MigrateAsync(context);
            }

            await using var check = database.CreateContext();
            (await DatabaseMigrator.GetPendingMigrationsAsync(check)).Should().BeEmpty();
        });
    }

    [Fact]
    public async Task GivenEmptyDatabase_WhenMigrating_ThenSchemaIsCurrentAndSystemSchoolsExist()
    {
        await WithEmptyDatabaseAsync(async database =>
        {
            await using (var context = database.CreateContext())
            {
                await DatabaseMigrator.MigrateAsync(context);
            }

            await using var check = database.CreateContext();
            (await check.Database.GetPendingMigrationsAsync()).Should().BeEmpty();
            await DatabaseMigrator.EnsureUpToDateAsync(check);
            var schools = await check.Schools.Include(s => s.Translations).ToListAsync();
            schools.Select(s => s.Slug).Should().BeEquivalentTo("hanafi", "maliki", "shafii", "hanbali");
            schools.Should().OnlyContain(s => s.IsSystem && s.Translations.Count == 1);
        });
    }

    [Fact]
    public async Task GivenMigratedDatabase_WhenMigratingAgain_ThenNothingIsDuplicated()
    {
        await WithEmptyDatabaseAsync(async database =>
        {
            await using (var first = database.CreateContext())
            {
                await DatabaseMigrator.MigrateAsync(first);
            }

            await using (var second = database.CreateContext())
            {
                await DatabaseMigrator.MigrateAsync(second);
            }

            await using var check = database.CreateContext();
            (await check.Schools.CountAsync()).Should().Be(4);
            (await check.Set<Mktba.Domain.Entities.SchoolTranslation>().CountAsync()).Should().Be(4);
        });
    }

    private static async Task WithEmptyDatabaseAsync(Func<PostgresDatabaseFixture, Task> test)
    {
        var database = PostgresDatabaseFixture.Empty();
        await database.InitializeAsync();
        try
        {
            await test(database);
        }
        finally
        {
            await database.DisposeAsync();
        }
    }
}
