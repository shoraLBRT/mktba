using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
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
    private readonly IReadOnlyDictionary<string, string> _settings;

    /// <summary>
    /// Test-only request header that sets the connection's remote IP, so tests can act as
    /// different clients. TestServer leaves the remote IP empty otherwise.
    /// </summary>
    public const string RemoteIpHeader = "X-Test-Remote-Ip";

    /// <summary>Rate limits high enough that suites sharing one factory never hit them.</summary>
    private static readonly IReadOnlyDictionary<string, string> GenerousRateLimits = new Dictionary<string, string>
    {
        ["RateLimiting:Auth:PermitLimit"] = "10000",
        ["RateLimiting:Ai:PermitLimit"] = "10000",
    };

    public MktbaApiFactory()
        : this("Testing", TestSigningKey)
    {
    }

    /// <param name="environment">Hosting environment the API starts in.</param>
    /// <param name="signingKey">Value of <c>Auth:JwtSigningKey</c>; <c>null</c> leaves it unset.</param>
    /// <param name="settings">Configuration overrides; <c>null</c> uses rate limits no test reaches.</param>
    internal MktbaApiFactory(string environment, string? signingKey, IReadOnlyDictionary<string, string>? settings = null)
    {
        _environment = environment;
        _signingKey = signingKey;
        _settings = settings ?? GenerousRateLimits;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(_environment);
        if (_signingKey is not null)
        {
            builder.UseSetting("Auth:JwtSigningKey", _signingKey);
        }
        foreach (var (key, value) in _settings)
        {
            builder.UseSetting(key, value);
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

            // InMemory has no transactions; services that open one (article create/update) still run.
            services.AddDbContext<MktbaDbContext>(options => options
                .UseInMemoryDatabase(_databaseName)
                .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
            services.AddSingleton<IStartupFilter, RemoteIpFromHeaderStartupFilter>();
        });
    }

    private sealed class RemoteIpFromHeaderStartupFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use((context, nextMiddleware) =>
            {
                if (IPAddress.TryParse(context.Request.Headers[RemoteIpHeader], out var address))
                {
                    context.Connection.RemoteIpAddress = address;
                }
                return nextMiddleware(context);
            });
            next(app);
        };
    }
}
