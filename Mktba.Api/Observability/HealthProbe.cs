namespace Mktba.Api.Observability;

/// <summary>
/// <c>dotnet Mktba.Api.dll --health-probe</c> (X-05, #159): asks the API running in the same container
/// for <see cref="HealthEndpoints.ReadyPath"/> and exits 0 on 2xx, 1 otherwise. The runtime image has
/// no curl or wget, so the deployment's healthcheck uses the API's own binary.
/// </summary>
public static class HealthProbe
{
    public const string Argument = "--health-probe";

    public static bool IsRequested(string[] args) => args.Contains(Argument, StringComparer.Ordinal);

    /// <summary>The port from <c>ASPNETCORE_HTTP_PORTS</c> (8080 in the .NET container images).</summary>
    public static Uri Target(string? httpPorts)
    {
        var port = (httpPorts ?? string.Empty)
            .Split([';', ','], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(value => int.TryParse(value, out var parsed) ? parsed : 0)
            .FirstOrDefault(parsed => parsed > 0);
        return new Uri($"http://127.0.0.1:{(port > 0 ? port : 8080)}{HealthEndpoints.ReadyPath}");
    }

    public static async Task<int> RunAsync(Uri target, HttpMessageHandler? handler = null)
    {
        using var client = handler is null ? new HttpClient() : new HttpClient(handler);
        client.Timeout = TimeSpan.FromSeconds(4);
        try
        {
            using var response = await client.GetAsync(target);
            Console.WriteLine($"{(int)response.StatusCode} {target}");
            return response.IsSuccessStatusCode ? 0 : 1;
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            Console.WriteLine($"unreachable {target}");
            return 1;
        }
    }
}
