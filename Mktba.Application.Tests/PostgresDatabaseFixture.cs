using Microsoft.EntityFrameworkCore;
using Mktba.Infrastructure.Data;
using Npgsql;

namespace Mktba.Application.Tests;

/// <summary>
/// A throwaway PostgreSQL database with every migration applied, for the tests that need what the
/// InMemory provider does not have (full-text search, R-10 #46). The server comes from
/// <c>MKTBA_TEST_DB_CONNECTION</c> (an Npgsql connection string; its database name is ignored) and
/// defaults to the compose service <c>postgres</c> — <c>docker compose up -d postgres</c>. The
/// database is created for the test class and dropped after it.
/// </summary>
public sealed class PostgresDatabaseFixture : IAsyncLifetime
{
    private const string ConnectionVariable = "MKTBA_TEST_DB_CONNECTION";
    private const string ComposeConnection = "Host=localhost;Port=5432;Username=mktba;Password=mktba_dev";

    private readonly string _databaseName = $"mktba_test_{Guid.NewGuid():N}";
    private readonly NpgsqlConnectionStringBuilder _server;
    private readonly bool _migrate;

    /// <summary>A throwaway database left empty: no migration applied (X-03 #65 tests the migration step itself).</summary>
    public static PostgresDatabaseFixture Empty() => new(migrate: false);

    public PostgresDatabaseFixture() : this(migrate: true)
    {
    }

    private PostgresDatabaseFixture(bool migrate)
    {
        var configured = Environment.GetEnvironmentVariable(ConnectionVariable);
        _migrate = migrate;
        _server = new NpgsqlConnectionStringBuilder(string.IsNullOrWhiteSpace(configured) ? ComposeConnection : configured);
    }

    /// <summary>A new context on the throwaway database.</summary>
    public MktbaDbContext CreateContext()
        => new(new DbContextOptionsBuilder<MktbaDbContext>().UseNpgsql(ConnectionTo(_databaseName)).Options);

    /// <summary>
    /// A context whose model has no trash columns (M-11, #133) nor translation-source columns (I-06, #110), for tests that write articles into the
    /// schema of an older migration before migrating it further.
    /// </summary>
    public MktbaDbContext CreatePreTrashContext()
        => new PreTrashDbContext(new DbContextOptionsBuilder<MktbaDbContext>().UseNpgsql(ConnectionTo(_databaseName)).Options);

    private sealed class PreTrashDbContext(DbContextOptions<MktbaDbContext> options) : MktbaDbContext(options)
    {
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            var article = modelBuilder.Entity<Domain.Entities.Article>();
            article.HasQueryFilter(null);
            article.Ignore(a => a.DeletedBy);
            article.Ignore(a => a.DeletedById);
            article.Ignore(a => a.DeletedAt);
            // Nor the translation source (I-06, #110), added after those migrations too.
            article.Ignore(a => a.TranslatedFrom);
            article.Ignore(a => a.TranslatedFromId);
            article.Ignore(a => a.TranslatedFromRevision);
        }
    }

    public async Task InitializeAsync()
    {
        if (!_migrate)
        {
            await ExecuteOnServerAsync($"CREATE DATABASE \"{_databaseName}\"");
            return;
        }

        await using var context = CreateContext();
        await context.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        NpgsqlConnection.ClearAllPools();
        await ExecuteOnServerAsync($"DROP DATABASE IF EXISTS \"{_databaseName}\" WITH (FORCE)");
    }

    private async Task ExecuteOnServerAsync(string sql)
    {
        await using var connection = new NpgsqlConnection(ConnectionTo("postgres"));
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync();
    }

    private string ConnectionTo(string database)
        => new NpgsqlConnectionStringBuilder(_server.ConnectionString) { Database = database }.ConnectionString;
}
