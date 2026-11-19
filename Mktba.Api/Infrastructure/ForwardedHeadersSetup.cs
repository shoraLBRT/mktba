using System.Net;
using Microsoft.AspNetCore.HttpOverrides;
using IPNetwork = Microsoft.AspNetCore.HttpOverrides.IPNetwork;

namespace Mktba.Api.Infrastructure;

/// <summary>
/// The <c>ForwardedHeaders</c> configuration section (F-03, #68): the reverse proxies whose
/// <c>X-Forwarded-For</c> is trusted. Empty (the default) trusts nobody: the client IP is the
/// socket address, and behind a proxy every visitor shares the per-IP rate limits.
/// </summary>
public sealed class ForwardedHeadersSettings
{
    public const string SectionName = "ForwardedHeaders";

    /// <summary>IP addresses of the proxies, for example <c>127.0.0.1</c>.</summary>
    public string[] KnownProxies { get; set; } = [];

    /// <summary>Networks the proxies are in, in CIDR notation, for example <c>172.18.0.0/16</c>.</summary>
    public string[] KnownNetworks { get; set; } = [];

    /// <summary>How many proxies stand in front of the API: that many addresses are taken off the end of the header.</summary>
    public int ForwardLimit { get; set; } = 1;
}

internal static class ForwardedHeadersSetup
{
    /// <summary>
    /// Makes <c>Connection.RemoteIpAddress</c> the visitor's address when the request came through a
    /// configured proxy. Only <c>X-Forwarded-For</c> is read; the scheme and host are left alone.
    /// </summary>
    /// <exception cref="InvalidOperationException">An address or network in the configuration cannot be parsed.</exception>
    public static IApplicationBuilder UseMktbaForwardedHeaders(this IApplicationBuilder app, IConfiguration configuration)
    {
        var settings = configuration.GetSection(ForwardedHeadersSettings.SectionName).Get<ForwardedHeadersSettings>() ?? new ForwardedHeadersSettings();
        if (settings.KnownProxies.Length == 0 && settings.KnownNetworks.Length == 0)
        {
            return app;
        }

        var options = new ForwardedHeadersOptions
        {
            ForwardedHeaders = ForwardedHeaders.XForwardedFor,
            ForwardLimit = Math.Max(1, settings.ForwardLimit),
        };
        options.KnownProxies.Clear();
        options.KnownNetworks.Clear();
        foreach (var proxy in settings.KnownProxies)
        {
            options.KnownProxies.Add(IPAddress.TryParse(proxy, out var address)
                ? address
                : throw new InvalidOperationException($"ForwardedHeaders:KnownProxies: '{proxy}' is not an IP address."));
        }

        foreach (var network in settings.KnownNetworks)
        {
            var parts = network.Split('/');
            if (parts.Length != 2 || !IPAddress.TryParse(parts[0], out var prefix) || !int.TryParse(parts[1], out var length))
            {
                throw new InvalidOperationException($"ForwardedHeaders:KnownNetworks: '{network}' is not a network in CIDR notation.");
            }

            options.KnownNetworks.Add(new IPNetwork(prefix, length));
        }

        return app.UseForwardedHeaders(options);
    }
}
