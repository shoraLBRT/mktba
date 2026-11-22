using System.Net.Http.Json;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;

namespace Mktba.Application.Services.IndexNow;

/// <summary>Sends a list of the site's URLs to an IndexNow endpoint; faked in tests.</summary>
public interface IIndexNowClient
{
    /// <summary>
    /// Sends <paramref name="paths"/> (site paths, at most <see cref="IndexNowOptions.MaxUrlsPerRequest"/>)
    /// as absolute URLs. True when the endpoint took them (200 or 202). Throws when the endpoint
    /// cannot be reached.
    /// </summary>
    Task<bool> SubmitAsync(IReadOnlyCollection<string> paths, CancellationToken cancellationToken);
}

/// <summary>
/// The IndexNow protocol (https://www.indexnow.org/documentation): one JSON POST with the host, the
/// key, where the key file is and the URLs. The key file is <see cref="IndexNowOptions.KeyFilePath"/>
/// at the site root, so every URL of the site may be sent.
/// </summary>
public sealed class IndexNowClient : IIndexNowClient
{
    public const string HttpClientName = "indexnow";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IndexNowOptions _options;

    public IndexNowClient(IHttpClientFactory httpClientFactory, IOptions<IndexNowOptions> options)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
    }

    public async Task<bool> SubmitAsync(IReadOnlyCollection<string> paths, CancellationToken cancellationToken)
    {
        if (!_options.IsConfigured || paths.Count == 0)
        {
            return false;
        }

        var client = _httpClientFactory.CreateClient(HttpClientName);
        using var response = await client.PostAsJsonAsync(_options.Endpoint, BuildRequest(paths, _options), cancellationToken);
        return response.IsSuccessStatusCode;
    }

    /// <summary>The request body for <paramref name="paths"/>; <paramref name="options"/> must be configured.</summary>
    public static IndexNowRequest BuildRequest(IReadOnlyCollection<string> paths, IndexNowOptions options)
    {
        var site = options.ValidSiteUrl ?? throw new InvalidOperationException("IndexNow is not configured.");
        var root = site.GetLeftPart(UriPartial.Authority);
        return new IndexNowRequest(
            site.Authority,
            options.ValidKey!,
            root + IndexNowOptions.KeyFilePath,
            paths.Select(path => root + path).ToList());
    }
}

/// <summary>The IndexNow request body; serialized with camelCase names (<c>host</c>, <c>key</c>, <c>keyLocation</c>, <c>urlList</c>).</summary>
public sealed record IndexNowRequest(string Host, string Key, string KeyLocation, IReadOnlyList<string> UrlList);
