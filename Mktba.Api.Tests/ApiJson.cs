using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using FluentAssertions;

namespace Mktba.Api.Tests;

/// <summary>JSON settings matching the API (enums as names) and shared request helpers.</summary>
internal static class ApiJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    /// <summary>The <c>code</c> of a problem response.</summary>
    public static async Task<string?> ReadCodeAsync(HttpResponseMessage response)
    {
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return problem.RootElement.GetProperty("code").GetString();
    }

    /// <summary>Moves a Draft article through review to Published.</summary>
    public static async Task PublishAsync(HttpClient admin, int articleId)
    {
        foreach (var status in new[] { "InReview", "Published" })
        {
            var response = await admin.PostAsJsonAsync($"/articles/{articleId}/status", new { status });
            response.StatusCode.Should().Be(HttpStatusCode.OK);
        }
    }
}
