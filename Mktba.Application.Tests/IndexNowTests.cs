using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.Services.IndexNow;

namespace Mktba.Application.Tests;

/// <summary>
/// O-12 (#61): when IndexNow counts as configured, what the queue takes, and the request the client
/// sends — against a recording <see cref="HttpMessageHandler"/>, never the network.
/// </summary>
public sealed class IndexNowTests
{
    private const string Key = "a1b2c3d4-e5f6";

    private static IndexNowOptions Configured() => new() { Key = Key, SiteUrl = "https://mktba.test/" };

    [Fact]
    public void IsConfigured_GivenKeyAndSiteUrl_IsTrue()
    {
        Configured().IsConfigured.Should().BeTrue();
    }

    [Theory]
    [InlineData(null, "https://mktba.test")]
    [InlineData("", "https://mktba.test")]
    [InlineData("short", "https://mktba.test")]
    [InlineData("has space in it", "https://mktba.test")]
    [InlineData("under_score_key", "https://mktba.test")]
    [InlineData(Key, null)]
    [InlineData(Key, "mktba.test")]
    [InlineData(Key, "ftp://mktba.test")]
    [InlineData(Key, "https://mktba.test/wiki")]
    public void IsConfigured_GivenMissingOrMalformedSetting_IsFalse(string? key, string? siteUrl)
    {
        new IndexNowOptions { Key = key, SiteUrl = siteUrl }.IsConfigured.Should().BeFalse();
    }

    [Fact]
    public void IsConfigured_GivenDisabled_IsFalseWhateverIsSet()
    {
        var options = Configured();
        options.Enabled = false;

        options.IsConfigured.Should().BeFalse();
    }

    [Fact]
    public void ArticleChanged_GivenConfigured_QueuesTheEscapedArticlePath()
    {
        var queue = new IndexNowQueue(Options.Create(Configured()));

        queue.ArticleChanged("намаз");

        queue.Reader.TryRead(out var path).Should().BeTrue();
        path.Should().Be("/%D0%BD%D0%B0%D0%BC%D0%B0%D0%B7");
    }

    [Fact]
    public void ArticleChanged_GivenNotConfigured_QueuesNothing()
    {
        var queue = new IndexNowQueue(Options.Create(new IndexNowOptions()));

        queue.ArticleChanged("namaz");

        queue.Reader.TryRead(out _).Should().BeFalse();
    }

    [Fact]
    public async Task SubmitAsync_GivenPaths_PostsHostKeyKeyLocationAndAbsoluteUrls()
    {
        var handler = new RecordingHandler(HttpStatusCode.Accepted);
        var client = new IndexNowClient(new HandlerFactory(handler), Options.Create(Configured()));

        var taken = await client.SubmitAsync(["/namaz", "/post"], CancellationToken.None);

        taken.Should().BeTrue();
        handler.Method.Should().Be("POST");
        handler.Uri.Should().Be("https://yandex.com/indexnow");
        using var body = JsonDocument.Parse(handler.Body!);
        body.RootElement.GetProperty("host").GetString().Should().Be("mktba.test");
        body.RootElement.GetProperty("key").GetString().Should().Be(Key);
        body.RootElement.GetProperty("keyLocation").GetString().Should().Be("https://mktba.test/indexnow-key.txt");
        body.RootElement.GetProperty("urlList").EnumerateArray().Select(url => url.GetString())
            .Should().Equal("https://mktba.test/namaz", "https://mktba.test/post");
    }

    [Fact]
    public async Task SubmitAsync_GivenEndpointRefuses_ReturnsFalse()
    {
        var handler = new RecordingHandler(HttpStatusCode.Forbidden);
        var client = new IndexNowClient(new HandlerFactory(handler), Options.Create(Configured()));

        (await client.SubmitAsync(["/namaz"], CancellationToken.None)).Should().BeFalse();
    }

    [Fact]
    public async Task SubmitAsync_GivenNotConfigured_SendsNothing()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK);
        var client = new IndexNowClient(new HandlerFactory(handler), Options.Create(new IndexNowOptions()));

        (await client.SubmitAsync(["/namaz"], CancellationToken.None)).Should().BeFalse();
        handler.Uri.Should().BeNull();
    }

    private sealed class HandlerFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class RecordingHandler(HttpStatusCode status) : HttpMessageHandler
    {
        public string? Method { get; private set; }

        public string? Uri { get; private set; }

        public string? Body { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Method = request.Method.Method;
            Uri = request.RequestUri!.ToString();
            Body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(status);
        }
    }
}
