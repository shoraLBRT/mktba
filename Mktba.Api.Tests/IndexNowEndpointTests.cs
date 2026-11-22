using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Application.Services.IndexNow;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>
/// O-12 (#61): the key the site serves for IndexNow, and the worker inside the running API sending a
/// published and an archived article's page to a stand-in endpoint.
/// </summary>
public sealed class IndexNowEndpointTests
{
    private const string Key = "test-indexnow-key-0123";

    private static readonly IReadOnlyDictionary<string, string> Configured = new Dictionary<string, string>
    {
        ["IndexNow:Key"] = Key,
        ["IndexNow:SiteUrl"] = "https://mktba.test",
        ["IndexNow:BatchDelaySeconds"] = "0",
    };

    [Fact]
    public async Task GivenIndexNowNotConfigured_WhenKeyIsRequested_ThenReturns404WithCode()
    {
        await using var factory = new MktbaApiFactory();

        var response = await factory.CreateClient().GetAsync("/seo/indexnow-key");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("indexnow_not_configured");
    }

    [Fact]
    public async Task GivenIndexNowDisabled_WhenKeyIsSet_ThenKeyIsNotServed()
    {
        var settings = new Dictionary<string, string>(Configured) { ["IndexNow:Enabled"] = "false" };
        await using var factory = new MktbaApiFactory("Testing", MktbaApiFactory.TestSigningKey, settings);

        var response = await factory.CreateClient().GetAsync("/seo/indexnow-key");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GivenIndexNowConfigured_WhenKeyIsRequestedAnonymously_ThenReturnsTheKey()
    {
        await using var factory = new MktbaApiFactory("Testing", MktbaApiFactory.TestSigningKey, Configured);

        var key = await factory.CreateClient().GetFromJsonAsync<IndexNowKeyDto>("/seo/indexnow-key", ApiJson.Options);

        key!.Key.Should().Be(Key);
    }

    [Fact]
    public async Task GivenIndexNowConfigured_WhenArticleIsPublishedThenArchived_ThenItsPageIsSentEachTime()
    {
        var endpoint = new RecordingIndexNowClient();
        await using var factory = new MktbaApiFactory("Testing", MktbaApiFactory.TestSigningKey, Configured) { IndexNowClient = endpoint };
        var (admin, _) = await RoleClients.CreateAsync(factory, UserRole.Admin);
        var created = await CreateArticleAsync(admin, "Статья для IndexNow");

        await ApiJson.PublishAsync(admin, created.Id);
        await WaitForAsync(endpoint, sends: 1);
        (await admin.PostAsJsonAsync($"/articles/{created.Id}/status", new { status = "Archived" })).EnsureSuccessStatusCode();
        await WaitForAsync(endpoint, sends: 2);

        var path = $"/{Uri.EscapeDataString(created.Slug!)}";
        endpoint.Sends.Should().HaveCount(2).And.AllSatisfy(send => send.Should().Equal(path));
    }

    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient admin, string title)
    {
        var dto = new ArticleContentCreateDto(
            title, null, [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
            null, null, null, null, null);
        var response = await admin.PostAsJsonAsync("/articles/content", dto);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleContentDto>())!;
    }

    private static async Task WaitForAsync(RecordingIndexNowClient endpoint, int sends)
    {
        var watch = Stopwatch.StartNew();
        while (endpoint.Sends.Count < sends)
        {
            if (watch.Elapsed > TimeSpan.FromSeconds(30))
            {
                throw new TimeoutException($"The worker sent {endpoint.Sends.Count} time(s), expected {sends}.");
            }

            await Task.Delay(100);
        }
    }

    private sealed class RecordingIndexNowClient : IIndexNowClient
    {
        public ConcurrentQueue<IReadOnlyCollection<string>> Sends { get; } = new();

        public Task<bool> SubmitAsync(IReadOnlyCollection<string> paths, CancellationToken cancellationToken)
        {
            Sends.Enqueue(paths.ToList());
            return Task.FromResult(true);
        }
    }
}
