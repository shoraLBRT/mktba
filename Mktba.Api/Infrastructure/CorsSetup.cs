namespace Mktba.Api.Infrastructure;

/// <summary>
/// The <c>Cors</c> configuration section (X-01, #63): the site origins allowed to call the API from a
/// browser with credentials (the refresh cookie), for example <c>https://mktba.ru</c>. Loopback and
/// <c>localhost</c> origins are always allowed (local development: Vite on <c>:5173</c>).
/// </summary>
public sealed class CorsSettings
{
    public const string SectionName = "Cors";

    /// <summary>Exact origins: scheme, host and, when not the default, port; no path.</summary>
    public string[] AllowedOrigins { get; set; } = [];
}

internal static class CorsSetup
{
    public const string PolicyName = "AllowMktbaReact";

    /// <exception cref="InvalidOperationException">An entry of <c>Cors:AllowedOrigins</c> is not an http(s) origin.</exception>
    public static IServiceCollection AddMktbaCors(this IServiceCollection services, IConfiguration configuration)
    {
        var settings = configuration.GetSection(CorsSettings.SectionName).Get<CorsSettings>() ?? new CorsSettings();
        var allowed = ParseOrigins(settings.AllowedOrigins);

        services.AddCors(options => options.AddPolicy(PolicyName, policy => policy
            .SetIsOriginAllowed(origin => IsAllowed(origin, allowed))
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials()));
        return services;
    }

    /// <summary>Loopback / <c>localhost</c>, or exactly one of <paramref name="allowed"/>.</summary>
    internal static bool IsAllowed(string origin, IReadOnlySet<string> allowed)
    {
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
        {
            return false;
        }

        return uri.IsLoopback
            || string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase)
            || allowed.Contains(uri.GetLeftPart(UriPartial.Authority));
    }

    internal static IReadOnlySet<string> ParseOrigins(IEnumerable<string> origins)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var raw in origins)
        {
            var value = raw.Trim().TrimEnd('/');
            if (value.Length == 0)
            {
                continue;
            }

            if (!Uri.TryCreate(value, UriKind.Absolute, out var uri)
                || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp)
                || uri.PathAndQuery != "/"
                || !string.IsNullOrEmpty(uri.Fragment))
            {
                throw new InvalidOperationException($"Cors:AllowedOrigins: '{raw}' is not an origin such as https://mktba.ru.");
            }

            result.Add(uri.GetLeftPart(UriPartial.Authority));
        }

        return result;
    }
}
