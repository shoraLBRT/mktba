using Microsoft.EntityFrameworkCore;
using Mktba.Infrastructure.Data;
using Npgsql;

namespace Mktba.Api.Tests;

/// <summary>
/// X-07 (#161): the API of <see cref="MktbaApiFactory"/> on a throwaway PostgreSQL database instead of
/// InMemory — real constraints, transactions, case rules and the search. The server comes from
/// <c>MKTBA_TEST_DB_CONNECTION</c> (an Npgsql connection string; its database name is ignored), as for
/// <c>PostgresDatabaseFixture</c> in Mktba.Application.Tests: CI's <c>postgres</c> service, locally the
/// compose <c>postgres</c> by default. The database is created and migrated (with the system schools)
/// before the API starts, and dropped after the test class.
/// </summary>
public sealed class PostgresApiFactory : MktbaApiFactory, IAsyncLifetime
{
    private const string ConnectionVariable = "MKTBA_TEST_DB_CONNECTION";
    private const string ComposeConnection = "Host=localhost;Port=5432;Username=mktba;Password=mktba_dev";

    private readonly string _connection;

    public PostgresApiFactory()
        : this(ConnectionTo($"mktba_api_test_{Guid.NewGuid():N}"))
    {
    }

    private PostgresApiFactory(string connection)
        : base(connection)
    {
        _connection = connection;
    }

    public async Task InitializeAsync()
    {
        await using var context = new MktbaDbContext(new DbContextOptionsBuilder<MktbaDbContext>().UseNpgsql(_connection).Options);
        await DatabaseMigrator.MigrateAsync(context);
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await DisposeAsync();
        NpgsqlConnection.ClearAllPools();
        var database = new NpgsqlConnectionStringBuilder(_connection).Database;
        await using var connection = new NpgsqlConnection(ConnectionTo("postgres"));
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"DROP DATABASE IF EXISTS \"{database}\" WITH (FORCE)";
        await command.ExecuteNonQueryAsync();
    }

    private static string ConnectionTo(string database)
    {
        var configured = Environment.GetEnvironmentVariable(ConnectionVariable);
        return new NpgsqlConnectionStringBuilder(string.IsNullOrWhiteSpace(configured) ? ComposeConnection : configured)
        {
            Database = database,
        }.ConnectionString;
    }
}
