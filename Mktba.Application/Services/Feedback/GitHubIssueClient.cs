using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;

namespace Mktba.Application.Services.Feedback;

/// <summary>
/// Creates issues in the configured repository as a GitHub App (F-02, #67). The app signs a
/// short-lived JWT with its private key, finds its installation on the repository, exchanges the
/// JWT for an installation token (cached until shortly before it expires) and creates the issue
/// with that token. The key is read when a JWT is needed and is never logged or stored; error
/// texts carry only status codes and GitHub's own message.
/// </summary>
public sealed class GitHubIssueClient : IFeedbackIssueTracker
{
    public const string HttpClientName = "feedback-github";

    private const int MarkerSearchPages = 3;
    private const int MarkerSearchPageSize = 100;
    private const int ErrorDetailMaxLength = 300;
    private static readonly TimeSpan TokenRefreshMargin = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan JwtLifetime = TimeSpan.FromMinutes(9);
    private static readonly TimeSpan JwtClockSkew = TimeSpan.FromSeconds(60);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly FeedbackGitHubOptions _options;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<GitHubIssueClient> _logger;

    private long? _installationId;
    private string? _installationToken;
    private DateTimeOffset _installationTokenExpiresAt;

    public GitHubIssueClient(
        IHttpClientFactory httpClientFactory,
        IOptions<FeedbackOptions> options,
        TimeProvider timeProvider,
        ILogger<GitHubIssueClient> logger)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value.GitHub;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public bool IsConfigured => _options.IsConfigured;

    private string RepositoryPath => $"repos/{Uri.EscapeDataString(_options.Owner!)}/{Uri.EscapeDataString(_options.Repository!)}";

    /// <summary>
    /// Pages through the repository's issues changed since <paramref name="sinceUtc"/>, newest
    /// first, at most 300 of them.
    /// </summary>
    public async Task<FeedbackIssueRef?> FindByMarkerAsync(string marker, DateTime sinceUtc, CancellationToken cancellationToken)
    {
        var since = Uri.EscapeDataString(sinceUtc.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture));
        for (var page = 1; page <= MarkerSearchPages; page++)
        {
            var path = $"{RepositoryPath}/issues?state=all&sort=created&direction=desc&since={since}&per_page={MarkerSearchPageSize}&page={page}";
            using var document = await SendWithInstallationTokenAsync(HttpMethod.Get, path, null, "list issues", cancellationToken);
            if (document.RootElement.ValueKind != JsonValueKind.Array)
            {
                throw new FeedbackTrackerException(FeedbackTrackerFailure.Unavailable, "GitHub list issues: unexpected response.");
            }

            var count = 0;
            foreach (var issue in document.RootElement.EnumerateArray())
            {
                count++;
                if (issue.TryGetProperty("body", out var body)
                    && body.ValueKind == JsonValueKind.String
                    && FeedbackIssueFormatter.EndsWithMarker(body.GetString()!, marker))
                {
                    return ReadIssue(issue);
                }
            }

            if (count < MarkerSearchPageSize)
            {
                break;
            }
        }

        return null;
    }

    public async Task<FeedbackIssueRef> CreateAsync(string title, string body, IReadOnlyList<string> labels, CancellationToken cancellationToken)
    {
        using var document = await SendWithInstallationTokenAsync(
            HttpMethod.Post, $"{RepositoryPath}/issues", new { title, body, labels }, "create issue", cancellationToken);
        var issue = ReadIssue(document.RootElement);

        var applied = document.RootElement.TryGetProperty("labels", out var labelsElement) && labelsElement.ValueKind == JsonValueKind.Array
            ? labelsElement.EnumerateArray()
                .Select(label => label.ValueKind == JsonValueKind.Object && label.TryGetProperty("name", out var name) ? name.GetString() : null)
                .ToList()
            : [];
        var missing = labels.Where(label => !applied.Contains(label, StringComparer.OrdinalIgnoreCase)).ToList();
        if (missing.Count > 0)
        {
            _logger.LogWarning(
                "GitHub created issue #{Number} without the labels {Labels}: create them in the repository and check the app's Issues permission.",
                issue.Number,
                string.Join(", ", missing));
        }

        return issue;
    }

    private static FeedbackIssueRef ReadIssue(JsonElement issue)
    {
        if (issue.ValueKind == JsonValueKind.Object
            && issue.TryGetProperty("number", out var number)
            && number.TryGetInt32(out var value)
            && issue.TryGetProperty("html_url", out var url)
            && url.GetString() is { Length: > 0 } address)
        {
            return new FeedbackIssueRef(value, address);
        }

        throw new FeedbackTrackerException(FeedbackTrackerFailure.Unavailable, "GitHub answered without an issue number.");
    }

    private async Task<JsonDocument> SendWithInstallationTokenAsync(
        HttpMethod method, string path, object? content, string action, CancellationToken cancellationToken)
    {
        var token = await GetInstallationTokenAsync(cancellationToken);
        return await SendAsync(method, path, token, content, action, isCredentialCall: false, cancellationToken);
    }

    private async Task<string> GetInstallationTokenAsync(CancellationToken cancellationToken)
    {
        var now = _timeProvider.GetUtcNow();
        if (_installationToken is not null && now < _installationTokenExpiresAt - TokenRefreshMargin)
        {
            return _installationToken;
        }

        var jwt = CreateAppJwt(now);
        if (_installationId is null)
        {
            using var installation = await SendAsync(
                HttpMethod.Get, $"{RepositoryPath}/installation", jwt, null, "find the app installation", isCredentialCall: true, cancellationToken);
            if (!installation.RootElement.TryGetProperty("id", out var id) || !id.TryGetInt64(out var installationId))
            {
                throw new FeedbackTrackerException(FeedbackTrackerFailure.Unavailable, "GitHub find the app installation: unexpected response.");
            }

            _installationId = installationId;
        }

        using var response = await SendAsync(
            HttpMethod.Post,
            $"app/installations/{_installationId.Value.ToString(CultureInfo.InvariantCulture)}/access_tokens",
            jwt,
            null,
            "get an installation token",
            isCredentialCall: true,
            cancellationToken);
        if (!response.RootElement.TryGetProperty("token", out var tokenElement)
            || tokenElement.GetString() is not { Length: > 0 } token
            || !response.RootElement.TryGetProperty("expires_at", out var expiresElement)
            || !expiresElement.TryGetDateTimeOffset(out var expiresAt))
        {
            throw new FeedbackTrackerException(FeedbackTrackerFailure.Unavailable, "GitHub get an installation token: unexpected response.");
        }

        _installationToken = token;
        _installationTokenExpiresAt = expiresAt;
        return token;
    }

    /// <summary>The app's JWT (RS256): issued a minute ago to allow for clock drift, valid for nine more.</summary>
    private string CreateAppJwt(DateTimeOffset now)
    {
        try
        {
            var pem = !string.IsNullOrWhiteSpace(_options.PrivateKey)
                ? _options.PrivateKey.Replace("\\n", "\n", StringComparison.Ordinal)
                : File.ReadAllText(_options.PrivateKeyPath!);
            using var rsa = RSA.Create();
            rsa.ImportFromPem(pem);

            var header = Base64Url(Encoding.UTF8.GetBytes("""{"alg":"RS256","typ":"JWT"}"""));
            var payload = Base64Url(JsonSerializer.SerializeToUtf8Bytes(new Dictionary<string, object>
            {
                ["iat"] = (now - JwtClockSkew).ToUnixTimeSeconds(),
                ["exp"] = (now + JwtLifetime).ToUnixTimeSeconds(),
                ["iss"] = _options.AppId!.Trim(),
            }));
            var signature = rsa.SignData(Encoding.ASCII.GetBytes($"{header}.{payload}"), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            return $"{header}.{payload}.{Base64Url(signature)}";
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or ArgumentException or CryptographicException or NotSupportedException)
        {
            // Only the exception type: its message could quote the path or a fragment of the key.
            throw new FeedbackTrackerException(
                FeedbackTrackerFailure.Unavailable,
                $"The GitHub App private key could not be read ({exception.GetType().Name}).");
        }
    }

    private static string Base64Url(byte[] bytes)
        => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private async Task<JsonDocument> SendAsync(
        HttpMethod method,
        string path,
        string bearer,
        object? content,
        string action,
        bool isCredentialCall,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(method, new Uri(new Uri(_options.ApiBaseUrl.TrimEnd('/') + "/"), path));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        request.Headers.Accept.ParseAdd("application/vnd.github+json");
        request.Headers.Add("X-GitHub-Api-Version", "2022-11-28");
        request.Headers.UserAgent.ParseAdd("mktba-feedback");
        if (content is not null)
        {
            request.Content = JsonContent.Create(content);
        }

        try
        {
            var client = _httpClientFactory.CreateClient(HttpClientName);
            using var response = await client.SendAsync(request, cancellationToken);
            var text = await response.Content.ReadAsStringAsync(cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                return JsonDocument.Parse(text);
            }

            throw Failure(response.StatusCode, text, action, isCredentialCall);
        }
        catch (HttpRequestException exception)
        {
            throw new FeedbackTrackerException(FeedbackTrackerFailure.Unavailable, $"GitHub {action}: no connection ({exception.GetType().Name}).");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new FeedbackTrackerException(FeedbackTrackerFailure.Unavailable, $"GitHub {action}: timed out.");
        }
        catch (JsonException)
        {
            throw new FeedbackTrackerException(FeedbackTrackerFailure.Unavailable, $"GitHub {action}: unreadable response.");
        }
    }

    private FeedbackTrackerException Failure(HttpStatusCode status, string responseText, string action, bool isCredentialCall)
    {
        var (detail, labelsRefused) = ReadError(responseText);
        if (status is HttpStatusCode.Unauthorized or HttpStatusCode.NotFound)
        {
            // The token may have been revoked or the app reinstalled: start from the key next time.
            _installationToken = null;
            _installationId = null;
        }

        // 422 on an issue means GitHub read the request and refused its content. A refusal that
        // names the labels is the repository's setup, not the message's fault.
        var rejected = !isCredentialCall && status == HttpStatusCode.UnprocessableEntity && !labelsRefused;
        return new FeedbackTrackerException(
            rejected ? FeedbackTrackerFailure.Rejected : FeedbackTrackerFailure.Unavailable,
            $"GitHub {action}: HTTP {(int)status}{(detail is null ? string.Empty : " — " + detail)}");
    }

    private static (string? Detail, bool LabelsRefused) ReadError(string responseText)
    {
        try
        {
            using var document = JsonDocument.Parse(responseText);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return (null, false);
            }

            var detail = root.TryGetProperty("message", out var message) && message.ValueKind == JsonValueKind.String
                ? message.GetString()
                : null;
            if (detail?.Length > ErrorDetailMaxLength)
            {
                detail = detail[..ErrorDetailMaxLength];
            }

            var labelsRefused = root.TryGetProperty("errors", out var errors)
                && errors.ValueKind == JsonValueKind.Array
                && errors.EnumerateArray().Any(error =>
                    error.ValueKind == JsonValueKind.Object
                    && error.TryGetProperty("field", out var field)
                    && field.ValueKind == JsonValueKind.String
                    && string.Equals(field.GetString(), "labels", StringComparison.OrdinalIgnoreCase));
            return (detail, labelsRefused);
        }
        catch (JsonException)
        {
            return (null, false);
        }
    }
}
