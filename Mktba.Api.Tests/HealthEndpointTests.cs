using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Mktba.Api.Observability;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>X-05 (#159): liveness, readiness and the container's probe.</summary>
public sealed class HealthEndpointTests : IClassFixture<MktbaApiFactory>
{
    private static readonly DateTimeOffset Start = new(2026, 11, 22, 12, 0, 0, TimeSpan.Zero);
    private readonly MktbaApiFactory _factory;

    public HealthEndpointTests(MktbaApiFactory factory) => _factory = factory;

    [Fact]
    public async Task GivenRunningApi_WhenAskingForLiveness_ThenAnswers200HealthyWithoutChecks()
    {
        var response = await _factory.CreateClient().GetAsync("/health/live");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.CacheControl!.NoStore.Should().BeTrue();
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("status").GetString().Should().Be("Healthy");
        body.RootElement.GetProperty("checks").EnumerateObject().Should().BeEmpty();
    }

    [Fact]
    public async Task GivenReachableDatabase_WhenAskingForReadiness_ThenAnswers200WithTheDatabaseAndWorkerChecks()
    {
        var response = await _factory.CreateClient().GetAsync("/health/ready");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var checks = body.RootElement.GetProperty("checks");
        checks.GetProperty("database").GetProperty("status").GetString().Should().Be("Healthy");
        checks.TryGetProperty("workers", out _).Should().BeTrue();
    }

    [Fact]
    public async Task GivenAWorkerWhoseLastRunFailed_WhenAskingForReadiness_ThenDegradedButStill200()
    {
        await using var factory = new MktbaApiFactory();
        var client = factory.CreateClient();
        factory.Services.GetRequiredService<WorkerHeartbeats>().Failed("test-worker");

        var response = await client.GetAsync("/health/ready");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("status").GetString().Should().Be("Degraded");
        var workers = body.RootElement.GetProperty("checks").GetProperty("workers");
        workers.GetProperty("status").GetString().Should().Be("Degraded");
        workers.GetProperty("description").GetString().Should().Contain("test-worker: the last run failed");
    }

    [Fact]
    public async Task GivenUnreachableDatabase_WhenCheckingIt_ThenUnhealthyWithoutTheConnectionDetails()
    {
        await using var context = new MktbaDbContext(new DbContextOptionsBuilder<MktbaDbContext>()
            .UseNpgsql("Host=127.0.0.1;Port=1;Database=mktba;Username=mktba;Password=secret-password;Timeout=1")
            .Options);

        var result = await new DatabaseHealthCheck(context).CheckHealthAsync(new HealthCheckContext());

        result.Status.Should().Be(HealthStatus.Unhealthy);
        result.Description.Should().Be("The database is unreachable.");
        result.Exception.Should().BeNull();
    }

    [Fact]
    public async Task GivenWorkersRunningOnTime_WhenChecking_ThenHealthyAndNamesThem()
    {
        var clock = new ManualClock(Start);
        var heartbeats = new WorkerHeartbeats(clock);
        heartbeats.Started("upload-cleanup", TimeSpan.FromHours(6));
        clock.Advance(TimeSpan.FromMinutes(1));
        heartbeats.Succeeded("upload-cleanup");
        clock.Advance(TimeSpan.FromHours(12));

        var result = await new WorkerHealthCheck(heartbeats, clock).CheckHealthAsync(new HealthCheckContext());

        result.Status.Should().Be(HealthStatus.Healthy);
        result.Description.Should().Contain("upload-cleanup");
    }

    [Fact]
    public async Task GivenAWorkerWithoutSuccessForThreeIntervals_WhenChecking_ThenDegraded()
    {
        var clock = new ManualClock(Start);
        var heartbeats = new WorkerHeartbeats(clock);
        heartbeats.Started("feedback-delivery", TimeSpan.FromSeconds(30));
        heartbeats.Succeeded("feedback-delivery");
        clock.Advance(TimeSpan.FromSeconds(90) + WorkerHealthCheck.Grace + TimeSpan.FromSeconds(1));

        var result = await new WorkerHealthCheck(heartbeats, clock).CheckHealthAsync(new HealthCheckContext());

        result.Status.Should().Be(HealthStatus.Degraded);
        result.Description.Should().Contain("feedback-delivery: no successful run since 2026-11-22T12:00:00Z");
    }

    [Fact]
    public async Task GivenAFailedRunFollowedByASuccess_WhenChecking_ThenHealthyAgain()
    {
        var clock = new ManualClock(Start);
        var heartbeats = new WorkerHeartbeats(clock);
        heartbeats.Started("article-draft-cleanup", TimeSpan.FromHours(6));
        heartbeats.Failed("article-draft-cleanup");
        heartbeats.Succeeded("article-draft-cleanup");

        var result = await new WorkerHealthCheck(heartbeats, clock).CheckHealthAsync(new HealthCheckContext());

        result.Status.Should().Be(HealthStatus.Healthy);
    }

    [Theory]
    [InlineData(null, "http://127.0.0.1:8080/health/ready")]
    [InlineData("", "http://127.0.0.1:8080/health/ready")]
    [InlineData("5000", "http://127.0.0.1:5000/health/ready")]
    [InlineData("x;8081,8082", "http://127.0.0.1:8081/health/ready")]
    public void GivenHttpPorts_WhenProbing_ThenTargetsTheFirstPortOnLoopback(string? ports, string expected)
        => HealthProbe.Target(ports).ToString().Should().Be(expected);

    [Theory]
    [InlineData(HttpStatusCode.OK, 0)]
    [InlineData(HttpStatusCode.ServiceUnavailable, 1)]
    public async Task GivenReadinessAnswer_WhenProbing_ThenExitCodeFollowsIt(HttpStatusCode status, int expected)
    {
        var exitCode = await HealthProbe.RunAsync(HealthProbe.Target(null), new StubHandler(_ => new HttpResponseMessage(status)));

        exitCode.Should().Be(expected);
    }

    [Fact]
    public async Task GivenNothingListening_WhenProbing_ThenExitCodeIsOne()
    {
        var exitCode = await HealthProbe.RunAsync(
            HealthProbe.Target(null),
            new StubHandler(_ => throw new HttpRequestException("Connection refused")));

        exitCode.Should().Be(1);
    }

    internal sealed class ManualClock(DateTimeOffset start) : TimeProvider
    {
        private DateTimeOffset _now = start;

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan by) => _now += by;
    }

    internal sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> answer) : HttpMessageHandler
    {
        public List<HttpRequestMessage> Requests { get; } = [];

        public List<string> Bodies { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            Bodies.Add(request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken));
            return answer(request);
        }
    }
}
