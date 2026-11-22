using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Mktba.Application.Services.Feedback;
using Mktba.Application.Services.IndexNow;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Storage;

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
        ["RateLimiting:Feedback:PermitLimit"] = "10000",
        ["RateLimiting:Uploads:PermitLimit"] = "10000",
        ["Feedback:Intake:MaxPerHour"] = "0",
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

            // The developer's appsettings.local.json may hold a real GitHub App key: tests never reach GitHub.
            services.RemoveAll<IFeedbackIssueTracker>();
            services.AddSingleton(IssueTracker ?? new NoIssueTracker());

            // Nor IndexNow, whatever the settings say.
            services.RemoveAll<IIndexNowClient>();
            services.AddSingleton(IndexNowClient ?? new NoIndexNowClient());

            // Uploaded files go to a directory of this factory only, removed with it.
            services.RemoveAll<IFileStorage>();
            services.AddSingleton<IFileStorage>(new LocalFileStorage(StorageRoot));
        });
    }

    /// <summary>A stand-in issue tracker for the feedback worker; null (the default) means none is configured.</summary>
    internal IFeedbackIssueTracker? IssueTracker { get; init; }

    /// <summary>A stand-in IndexNow endpoint; null (the default) refuses every send.</summary>
    internal IIndexNowClient? IndexNowClient { get; init; }

    /// <summary>Where this factory's API stores uploaded files.</summary>
    internal string StorageRoot { get; } = Path.Combine(Path.GetTempPath(), $"mktba-api-tests-files-{Guid.NewGuid():N}");

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing && Directory.Exists(StorageRoot))
        {
            Directory.Delete(StorageRoot, recursive: true);
        }
    }

    /// <summary>A tracker that is never configured: feedback stays pending and nothing is sent anywhere.</summary>
    private sealed class NoIssueTracker : IFeedbackIssueTracker
    {
        public bool IsConfigured => false;

        public Task<FeedbackIssueRef?> FindByMarkerAsync(string marker, DateTime sinceUtc, CancellationToken cancellationToken)
            => throw new InvalidOperationException("Tests do not deliver feedback.");

        public Task<FeedbackIssueRef> CreateAsync(string title, string body, IReadOnlyList<string> labels, CancellationToken cancellationToken)
            => throw new InvalidOperationException("Tests do not deliver feedback.");
    }

    /// <summary>An endpoint that takes nothing: no test sends URLs anywhere.</summary>
    private sealed class NoIndexNowClient : IIndexNowClient
    {
        public Task<bool> SubmitAsync(IReadOnlyCollection<string> paths, CancellationToken cancellationToken)
            => Task.FromResult(false);
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
