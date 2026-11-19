using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.Services.Feedback;

namespace Mktba.Application.Tests;

/// <summary>
/// F-02 (#67): the GitHub App client against a scripted <see cref="HttpMessageHandler"/> and a key
/// generated here. Nothing in these tests reaches GitHub.
/// </summary>
public sealed class GitHubIssueClientTests : IDisposable
{
    private const string InstallationToken = "ghs_test_installation_token";
    private static readonly DateTimeOffset Now = new(2026, 11, 19, 10, 0, 0, TimeSpan.Zero);

    private readonly RSA _key = RSA.Create(2048);
    private readonly ScriptedHandler _handler = new();
    private readonly FakeClock _clock = new(Now);

    public void Dispose() => _key.Dispose();

    [Fact]
    public async Task GivenConfiguredApp_WhenCreatingIssue_ThenItSignsJwtFindsInstallationAndPostsWithInstallationToken()
    {
        ScriptAuthentication();
        _handler.Enqueue(HttpStatusCode.Created, """{"number":12,"html_url":"https://github.com/o/r/issues/12","labels":[{"name":"feedback"},{"name":"needs-triage"}]}""");

        var issue = await Client().CreateAsync("Заголовок", "Текст", ["feedback", "needs-triage"], CancellationToken.None);

        issue.Should().Be(new FeedbackIssueRef(12, "https://github.com/o/r/issues/12"));
        _handler.Requests.Select(r => $"{r.Method} {r.Path}").Should().Equal(
            "GET /repos/o/r/installation",
            "POST /app/installations/4242/access_tokens",
            "POST /repos/o/r/issues");

        var jwt = _handler.Requests[0].Bearer;
        _handler.Requests[1].Bearer.Should().Be(jwt);
        var parts = jwt.Split('.');
        parts.Should().HaveCount(3);
        _key.VerifyData(Encoding.ASCII.GetBytes($"{parts[0]}.{parts[1]}"), FromBase64Url(parts[2]), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)
            .Should().BeTrue();
        using var header = JsonDocument.Parse(FromBase64Url(parts[0]));
        header.RootElement.GetProperty("alg").GetString().Should().Be("RS256");
        using var payload = JsonDocument.Parse(FromBase64Url(parts[1]));
        payload.RootElement.GetProperty("iss").GetString().Should().Be("5514770");
        payload.RootElement.GetProperty("iat").GetInt64().Should().Be(Now.AddSeconds(-60).ToUnixTimeSeconds());
        payload.RootElement.GetProperty("exp").GetInt64().Should().Be(Now.AddMinutes(9).ToUnixTimeSeconds());

        var create = _handler.Requests[2];
        create.Bearer.Should().Be(InstallationToken);
        create.Headers["Accept"].Should().Be("application/vnd.github+json");
        create.Headers["X-GitHub-Api-Version"].Should().Be("2022-11-28");
        create.Headers["User-Agent"].Should().NotBeNullOrEmpty();
        using var sent = JsonDocument.Parse(create.Body!);
        sent.RootElement.GetProperty("title").GetString().Should().Be("Заголовок");
        sent.RootElement.GetProperty("body").GetString().Should().Be("Текст");
        sent.RootElement.GetProperty("labels").EnumerateArray().Select(l => l.GetString()).Should().Equal("feedback", "needs-triage");
    }

    [Fact]
    public async Task GivenKeyInAFile_WhenCreatingIssue_ThenTheKeyIsReadFromThePath()
    {
        var path = Path.Combine(Path.GetTempPath(), $"mktba-test-key-{Guid.NewGuid():N}.pem");
        await File.WriteAllTextAsync(path, _key.ExportRSAPrivateKeyPem());
        try
        {
            ScriptAuthentication();
            _handler.Enqueue(HttpStatusCode.Created, """{"number":1,"html_url":"https://github.com/o/r/issues/1","labels":[]}""");

            var issue = await Client(o => { o.PrivateKey = null; o.PrivateKeyPath = path; }).CreateAsync("t", "b", [], CancellationToken.None);

            issue.Number.Should().Be(1);
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public async Task GivenValidInstallationToken_WhenCreatingSecondIssue_ThenTokenIsReusedUntilItNearsExpiry()
    {
        var client = Client();
        ScriptAuthentication();
        _handler.Enqueue(HttpStatusCode.Created, IssueJson(1));
        await client.CreateAsync("t", "b", [], CancellationToken.None);

        _handler.Enqueue(HttpStatusCode.Created, IssueJson(2));
        await client.CreateAsync("t", "b", [], CancellationToken.None);
        _handler.Requests.Should().HaveCount(4, "the second issue needs no new token");

        _clock.Advance(TimeSpan.FromMinutes(56));
        _handler.Enqueue(HttpStatusCode.Created, """{"token":"ghs_second","expires_at":"2026-11-19T12:00:00Z"}""");
        _handler.Enqueue(HttpStatusCode.Created, IssueJson(3));
        await client.CreateAsync("t", "b", [], CancellationToken.None);

        _handler.Requests.Select(r => r.Path).Skip(4).Should().Equal("/app/installations/4242/access_tokens", "/repos/o/r/issues");
        _handler.Requests[^1].Bearer.Should().Be("ghs_second");
    }

    [Theory]
    [InlineData(HttpStatusCode.UnprocessableEntity, """{"message":"Validation Failed","errors":[{"resource":"Issue","field":"title","code":"too_long"}]}""", FeedbackTrackerFailure.Rejected)]
    [InlineData(HttpStatusCode.UnprocessableEntity, """{"message":"Validation Failed","errors":[{"resource":"Issue","field":"labels","code":"invalid"}]}""", FeedbackTrackerFailure.Unavailable)]
    [InlineData(HttpStatusCode.ServiceUnavailable, "<html>down</html>", FeedbackTrackerFailure.Unavailable)]
    [InlineData(HttpStatusCode.TooManyRequests, """{"message":"API rate limit exceeded"}""", FeedbackTrackerFailure.Unavailable)]
    [InlineData(HttpStatusCode.Forbidden, """{"message":"Resource not accessible by integration"}""", FeedbackTrackerFailure.Unavailable)]
    [InlineData(HttpStatusCode.Gone, """{"message":"Issues are disabled for this repo"}""", FeedbackTrackerFailure.Unavailable)]
    public async Task GivenGitHubRefusesTheIssue_WhenCreating_ThenOnlyAContentRefusalIsARejection(
        HttpStatusCode status, string responseBody, FeedbackTrackerFailure expected)
    {
        ScriptAuthentication();
        _handler.Enqueue(status, responseBody);

        var act = () => Client().CreateAsync("t", "b", ["feedback"], CancellationToken.None);

        var exception = (await act.Should().ThrowAsync<FeedbackTrackerException>()).Which;
        exception.Failure.Should().Be(expected);
        exception.Message.Should().StartWith($"GitHub create issue: HTTP {(int)status}").And.NotContain(InstallationToken);
    }

    [Fact]
    public async Task GivenTokenNoLongerAccepted_WhenCreating_ThenNextCallAuthenticatesFromTheKeyAgain()
    {
        var client = Client();
        ScriptAuthentication();
        _handler.Enqueue(HttpStatusCode.Unauthorized, """{"message":"Bad credentials"}""");
        var act = () => client.CreateAsync("t", "b", [], CancellationToken.None);
        (await act.Should().ThrowAsync<FeedbackTrackerException>()).Which.Failure.Should().Be(FeedbackTrackerFailure.Unavailable);

        ScriptAuthentication();
        _handler.Enqueue(HttpStatusCode.Created, IssueJson(5));
        var issue = await client.CreateAsync("t", "b", [], CancellationToken.None);

        issue.Number.Should().Be(5);
        _handler.Requests.Select(r => r.Path).Skip(3).Should().Equal(
            "/repos/o/r/installation", "/app/installations/4242/access_tokens", "/repos/o/r/issues");
    }

    [Fact]
    public async Task GivenAppNotInstalledOnRepository_WhenCreating_ThenItIsUnavailableNotRejected()
    {
        _handler.Enqueue(HttpStatusCode.NotFound, """{"message":"Not Found"}""");

        var act = () => Client().CreateAsync("t", "b", [], CancellationToken.None);

        var exception = (await act.Should().ThrowAsync<FeedbackTrackerException>()).Which;
        exception.Failure.Should().Be(FeedbackTrackerFailure.Unavailable);
        exception.Message.Should().Be("GitHub find the app installation: HTTP 404 — Not Found");
    }

    [Fact]
    public async Task GivenNoConnection_WhenCreating_ThenItIsUnavailable()
    {
        _handler.EnqueueException(new HttpRequestException("No such host is known. (api.github.test:443)"));

        var act = () => Client().CreateAsync("t", "b", [], CancellationToken.None);

        var exception = (await act.Should().ThrowAsync<FeedbackTrackerException>()).Which;
        exception.Failure.Should().Be(FeedbackTrackerFailure.Unavailable);
        exception.Message.Should().Contain("no connection");
    }

    [Theory]
    [InlineData("not a pem at all", null)]
    [InlineData(null, "Z:/no/such/dir/secret-key-name.pem")]
    public async Task GivenUnreadableKey_WhenCreating_ThenItIsUnavailableAndTheErrorNamesNeitherKeyNorPath(string? key, string? path)
    {
        var act = () => Client(o => { o.PrivateKey = key; o.PrivateKeyPath = path; }).CreateAsync("t", "b", [], CancellationToken.None);

        var exception = (await act.Should().ThrowAsync<FeedbackTrackerException>()).Which;
        exception.Failure.Should().Be(FeedbackTrackerFailure.Unavailable);
        exception.Message.Should().StartWith("The GitHub App private key could not be read").And.NotContain("secret-key-name").And.NotContain("not a pem");
        _handler.Requests.Should().BeEmpty();
    }

    [Fact]
    public async Task GivenIssueWithTheMarkerOnSecondPage_WhenSearching_ThenItIsFound()
    {
        ScriptAuthentication();
        var firstPage = "[" + string.Join(",", Enumerable.Range(1, 100).Select(n => $$"""{"number":{{n}},"html_url":"https://github.com/o/r/issues/{{n}}","body":null}""")) + "]";
        _handler.Enqueue(HttpStatusCode.OK, firstPage);
        _handler.Enqueue(HttpStatusCode.OK, """[{"number":7,"html_url":"https://github.com/o/r/issues/7","body":"text\n\n<!-- mktba-feedback:abc -->\n"}]""");

        var found = await Client().FindByMarkerAsync("<!-- mktba-feedback:abc -->", new DateTime(2026, 11, 19, 9, 55, 0, DateTimeKind.Utc), CancellationToken.None);

        found.Should().Be(new FeedbackIssueRef(7, "https://github.com/o/r/issues/7"));
        _handler.Requests[2].PathAndQuery.Should().Be("/repos/o/r/issues?state=all&sort=created&direction=desc&since=2026-11-19T09%3A55%3A00Z&per_page=100&page=1");
        _handler.Requests[3].PathAndQuery.Should().EndWith("&page=2");
        _handler.Requests[2].Bearer.Should().Be(InstallationToken);
    }

    [Fact]
    public async Task GivenNoIssueWithTheMarker_WhenSearching_ThenNull()
    {
        ScriptAuthentication();
        _handler.Enqueue(HttpStatusCode.OK, """[{"number":7,"html_url":"https://github.com/o/r/issues/7","body":"<!-- mktba-feedback:other -->"}]""");

        var found = await Client().FindByMarkerAsync("<!-- mktba-feedback:abc -->", Now.UtcDateTime, CancellationToken.None);

        found.Should().BeNull();
        _handler.Requests.Should().HaveCount(3);
    }

    [Fact]
    public async Task GivenIssueThatOnlyQuotesTheMarkerInItsText_WhenSearching_ThenItIsNotTakenForTheDelivery()
    {
        ScriptAuthentication();
        _handler.Enqueue(HttpStatusCode.OK, """
            [{"number":7,"html_url":"https://github.com/o/r/issues/7","body":"````text\n<!-- mktba-feedback:abc -->\n````\n\n<!-- mktba-feedback:other -->\n"},
             {"number":8,"html_url":"https://github.com/o/r/issues/8","body":"text\n\n<!-- mktba-feedback:abc -->\n"}]
            """);

        var found = await Client().FindByMarkerAsync("<!-- mktba-feedback:abc -->", Now.UtcDateTime, CancellationToken.None);

        found.Should().Be(new FeedbackIssueRef(8, "https://github.com/o/r/issues/8"));
    }

    private void ScriptAuthentication()
    {
        _handler.Enqueue(HttpStatusCode.OK, """{"id":4242,"app_id":5514770}""");
        _handler.Enqueue(HttpStatusCode.Created, $$"""{"token":"{{InstallationToken}}","expires_at":"2026-11-19T11:00:00Z"}""");
    }

    private static string IssueJson(int number)
        => $$"""{"number":{{number}},"html_url":"https://github.com/o/r/issues/{{number}}","labels":[]}""";

    private GitHubIssueClient Client(Action<FeedbackGitHubOptions>? configure = null)
    {
        var options = new FeedbackOptions
        {
            GitHub =
            {
                AppId = "5514770",
                Owner = "o",
                Repository = "r",
                // As an environment variable would carry it: line breaks written as \n.
                PrivateKey = _key.ExportRSAPrivateKeyPem().Replace("\n", "\\n"),
                ApiBaseUrl = "https://api.github.test",
            },
        };
        configure?.Invoke(options.GitHub);
        return new GitHubIssueClient(new HandlerFactory(_handler), Options.Create(options), _clock, NullLogger<GitHubIssueClient>.Instance);
    }

    private static byte[] FromBase64Url(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(padded.PadRight(padded.Length + ((4 - (padded.Length % 4)) % 4), '='));
    }

    private sealed class FakeClock(DateTimeOffset start) : TimeProvider
    {
        private DateTimeOffset _now = start;

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan by) => _now = _now.Add(by);
    }

    private sealed class HandlerFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed record SentRequest(string Method, string Path, string PathAndQuery, string Bearer, IReadOnlyDictionary<string, string> Headers, string? Body);

    /// <summary>Answers requests from a queue, in order, and fails the test on a request nobody scripted.</summary>
    private sealed class ScriptedHandler : HttpMessageHandler
    {
        private readonly Queue<Func<HttpResponseMessage>> _responses = new();

        public List<SentRequest> Requests { get; } = [];

        public void Enqueue(HttpStatusCode status, string body)
            => _responses.Enqueue(() => new HttpResponseMessage(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") });

        public void EnqueueException(Exception exception) => _responses.Enqueue(() => throw exception);

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            request.RequestUri!.Host.Should().Be("api.github.test");
            Requests.Add(new SentRequest(
                request.Method.Method,
                request.RequestUri.AbsolutePath,
                request.RequestUri.PathAndQuery,
                request.Headers.Authorization?.Parameter ?? string.Empty,
                request.Headers.ToDictionary(h => h.Key, h => string.Join(" ", h.Value)),
                request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken)));
            if (_responses.Count == 0)
            {
                throw new InvalidOperationException($"Unexpected request: {request.Method} {request.RequestUri}");
            }

            return _responses.Dequeue()();
        }
    }
}
