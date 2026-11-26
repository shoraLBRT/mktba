using System.Collections.Concurrent;
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
using Microsoft.Extensions.Logging;
using Mktba.Api.Observability;
using Mktba.Application.Services.Analytics;
using Mktba.Application.Services.Email;
using Mktba.Application.Services.Feedback;
using Mktba.Application.Services.IndexNow;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Storage;

namespace Mktba.Api.Tests;

/// <summary>
/// Hosts the real API pipeline (routing, authentication, authorization) on an isolated
/// InMemory database, so endpoint access rules are tested without PostgreSQL.
/// <see cref="PostgresApiFactory"/> runs the same pipeline on a throwaway PostgreSQL database (X-07, #161).
/// </summary>
public class MktbaApiFactory : WebApplicationFactory<Program>
{
    /// <summary>A throwaway 48-byte key: long enough for HS256 and not a committed placeholder.</summary>
    public static readonly string TestSigningKey = Convert.ToBase64String(Guid.NewGuid().ToByteArray().Concat(Guid.NewGuid().ToByteArray()).ToArray())
        + "-mktba-api-tests";

    private readonly string _databaseName = $"mktba-api-tests-{Guid.NewGuid()}";
    private readonly string _environment;
    private readonly string? _signingKey;
    private readonly IReadOnlyDictionary<string, string> _settings;
    private readonly string? _postgresConnection;

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
        ["RateLimiting:Analytics:PermitLimit"] = "10000",
        ["RateLimiting:ClientErrors:PermitLimit"] = "10000",
        ["Feedback:Intake:MaxPerHour"] = "0",
        // The email outbox is walked by the tests themselves (NotificationEmailService), not by the worker.
        ["Email:Delivery:PollIntervalSeconds"] = "86400",
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

    /// <param name="postgresConnection">The PostgreSQL database the API uses instead of InMemory; it must already be migrated.</param>
    protected MktbaApiFactory(string postgresConnection)
        : this("Testing", TestSigningKey)
    {
        _postgresConnection = postgresConnection;
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
        if (Logs is not null)
        {
            builder.ConfigureLogging(logging => logging.AddProvider(Logs));
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

            if (_postgresConnection is not null)
            {
                // Whatever appsettings.local.json says, the API uses the test's own database.
                services.AddDbContext<MktbaDbContext>(options => options.UseNpgsql(_postgresConnection));
            }
            else
            {
                // InMemory has no transactions; services that open one (article create/update) still run.
                services.AddDbContext<MktbaDbContext>(options => options
                    .UseInMemoryDatabase(_databaseName)
                    .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
            }
            services.AddSingleton<IStartupFilter, RemoteIpFromHeaderStartupFilter>();

            // The developer's appsettings.local.json may hold a real GitHub App key: tests never reach GitHub.
            services.RemoveAll<IFeedbackIssueTracker>();
            services.AddSingleton(IssueTracker ?? new NoIssueTracker());

            // Nor a mail server: notification emails go to the factory's recorder (V-09, #125).
            services.RemoveAll<IEmailSender>();
            services.AddSingleton<IEmailSender>(Emails);

            // Nor IndexNow, whatever the settings say.
            services.RemoveAll<IIndexNowClient>();
            services.AddSingleton(IndexNowClient ?? new NoIndexNowClient());

            // The search needs PostgreSQL: a search event's result count comes from SearchResults.
            services.RemoveAll<ISearchResultCounter>();
            services.AddSingleton<ISearchResultCounter>(new StubSearchResultCounter(this));

            // Nor Telegram: alerts go to the test's channel, or nowhere.
            services.RemoveAll<IAlertChannel>();
            services.AddSingleton(AlertChannel ?? new NoAlertChannel());

            // Uploaded files go to a directory of this factory only, removed with it.
            services.RemoveAll<IFileStorage>();
            services.AddSingleton<IFileStorage>(new LocalFileStorage(StorageRoot));
        });
    }

    /// <summary>A stand-in issue tracker for the feedback worker; null (the default) means none is configured.</summary>
    internal IFeedbackIssueTracker? IssueTracker { get; init; }

    /// <summary>The emails the API handed over, in order.</summary>
    internal RecordingEmailSender Emails { get; } = new();

    /// <summary>A stand-in IndexNow endpoint; null (the default) refuses every send.</summary>
    internal IIndexNowClient? IndexNowClient { get; init; }

    /// <summary>
    /// What the site's search finds for a query when a search event arrives (N-06, #100): the count
    /// set here, 1 for a query not set.
    /// </summary>
    internal ConcurrentDictionary<string, int> SearchResults { get; } = new(StringComparer.Ordinal);

    /// <summary>How many times the stand-in search has been run.</summary>
    internal int SearchCounts => _searchCounts;

    private int _searchCounts;

    /// <summary>A stand-in alert channel; null (the default) is one that is not configured.</summary>
    internal IAlertChannel? AlertChannel { get; init; }

    /// <summary>Captures the API's log entries when set.</summary>
    internal CapturingLoggerProvider? Logs { get; init; }

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

    internal sealed class RecordingEmailSender : IEmailSender
    {
        private readonly System.Collections.Concurrent.ConcurrentQueue<EmailMessage> _sent = new();

        public IReadOnlyList<EmailMessage> Sent => _sent.ToArray();

        public Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
        {
            _sent.Enqueue(message);
            return Task.CompletedTask;
        }
    }

    /// <summary>An endpoint that takes nothing: no test sends URLs anywhere.</summary>
    private sealed class NoIndexNowClient : IIndexNowClient
    {
        public Task<bool> SubmitAsync(IReadOnlyCollection<string> paths, CancellationToken cancellationToken)
            => Task.FromResult(false);
    }

    private sealed class StubSearchResultCounter(MktbaApiFactory factory) : ISearchResultCounter
    {
        public Task<int> CountAsync(string query, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref factory._searchCounts);
            return Task.FromResult(factory.SearchResults.GetValueOrDefault(query, 1));
        }
    }

    private sealed class NoAlertChannel : IAlertChannel
    {
        public bool IsConfigured => false;

        public Task SendAsync(string text, CancellationToken cancellationToken)
            => throw new InvalidOperationException("Tests send no alerts.");
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
