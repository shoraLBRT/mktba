using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>
/// Hosts the real API pipeline (routing, authentication, authorization) on an isolated
/// InMemory database, so endpoint access rules are tested without PostgreSQL.
/// </summary>
public sealed class MktbaApiFactory : WebApplicationFactory<Program>
{
    /// <summary>A throwaway 48-byte key: long enough for HS256 and not a committed placeholder.</summary>
    public static readonly string TestSigningKey = Convert.ToBase64String(Guid.NewGuid().ToByteArray().Concat(Guid.NewGuid().ToByteArray()).ToArray())
        + "-mktba-api-tests";

    private readonly string _databaseName = $"mktba-api-tests-{Guid.NewGuid()}";
    private readonly string _environment;
    private readonly string? _signingKey;

    public MktbaApiFactory()
        : this("Testing", TestSigningKey)
    {
    }

    /// <param name="environment">Hosting environment the API starts in.</param>
    /// <param name="signingKey">Value of <c>Auth:JwtSigningKey</c>; <c>null</c> leaves it unset.</param>
    internal MktbaApiFactory(string environment, string? signingKey)
    {
        _environment = environment;
        _signingKey = signingKey;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(_environment);
        if (_signingKey is not null)
        {
            builder.UseSetting("Auth:JwtSigningKey", _signingKey);
        }
        builder.ConfigureServices(services =>
        {
            var npgsqlRegistrations = services
                .Where(descriptor =>
                    descriptor.ServiceType == typeof(DbContextOptions<MktbaDbContext>)
                    || descriptor.ServiceType == typeof(IDbContextOptionsConfiguration<MktbaDbContext>))
                .ToList();
            foreach (var descriptor in npgsqlRegistrations)
            {
                services.Remove(descriptor);
            }

            services.AddDbContext<MktbaDbContext>(options => options.UseInMemoryDatabase(_databaseName));
        });
    }
}
