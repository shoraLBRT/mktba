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
    private readonly string _databaseName = $"mktba-api-tests-{Guid.NewGuid()}";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
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
