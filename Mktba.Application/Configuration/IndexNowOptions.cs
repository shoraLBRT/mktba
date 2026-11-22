using System.Text.RegularExpressions;

namespace Mktba.Application.Configuration;

/// <summary>
/// The <c>IndexNow</c> configuration section (O-12, #61): telling search engines (Yandex, Bing and
/// the other IndexNow members, which share what one of them is told) that a page appeared or went.
/// Off unless <see cref="Key"/> and <see cref="SiteUrl"/> are both set.
/// </summary>
public sealed partial class IndexNowOptions
{
    public const string SectionName = "IndexNow";

    /// <summary>Where the site's key file is served (the frontend's resource route).</summary>
    public const string KeyFilePath = "/indexnow-key.txt";

    /// <summary>The most URLs one IndexNow request may carry.</summary>
    public const int MaxUrlsPerRequest = 10_000;

    /// <summary>
    /// False switches the pings off whatever else is set: for test runs on a machine whose local
    /// settings hold a real key (the e2e API sets it).
    /// </summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// The site's key: 8 to 128 characters of <c>a-z</c>, <c>A-Z</c>, <c>0-9</c> and <c>-</c>. It is
    /// public by design — the site serves it at <see cref="KeyFilePath"/> to prove it owns the host.
    /// </summary>
    public string? Key { get; set; }

    /// <summary>The site's public address, for example <c>https://mktba.ru</c>; the URLs sent are built on it.</summary>
    public string? SiteUrl { get; set; }

    /// <summary>The IndexNow endpoint the URLs are sent to.</summary>
    public string Endpoint { get; set; } = "https://yandex.com/indexnow";

    /// <summary>How long the worker waits after the first change before sending, so a bulk action goes in one request.</summary>
    public int BatchDelaySeconds { get; set; } = 5;

    /// <summary>The trimmed key when it has the form IndexNow requires, else null.</summary>
    public string? ValidKey => Key?.Trim() is { } key && KeyRegex().IsMatch(key) ? key : null;

    /// <summary><see cref="SiteUrl"/> as an absolute http(s) address without a trailing slash, else null.</summary>
    public Uri? ValidSiteUrl =>
        Uri.TryCreate(SiteUrl?.Trim().TrimEnd('/'), UriKind.Absolute, out var site)
        && (site.Scheme == Uri.UriSchemeHttps || site.Scheme == Uri.UriSchemeHttp)
        && site.AbsolutePath == "/"
            ? site
            : null;

    /// <summary>Enabled, with a valid key, site address and endpoint: pings are sent.</summary>
    public bool IsConfigured =>
        Enabled && ValidKey is not null && ValidSiteUrl is not null
        && Uri.TryCreate(Endpoint, UriKind.Absolute, out var endpoint) && endpoint.Scheme == Uri.UriSchemeHttps;

    [GeneratedRegex("^[a-zA-Z0-9-]{8,128}$")]
    private static partial Regex KeyRegex();
}
