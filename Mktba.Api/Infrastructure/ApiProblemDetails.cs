using System.Text.Json.Serialization;

namespace Mktba.Api.Infrastructure;

/// <summary>
/// The body of every error response (<c>application/problem+json</c>).
/// Clients show a message chosen by <see cref="Code"/>, never <see cref="Title"/>.
/// </summary>
/// <param name="Title">English description for logs and developers.</param>
/// <param name="Status">The HTTP status code.</param>
/// <param name="Code">Stable snake_case error code, see <c>Mktba.Application.Exceptions.AppErrors</c>.</param>
/// <param name="Params">Values for interpolation into the client's message; omitted when there are none.</param>
/// <param name="TraceId">Request trace id, for matching a report with the logs.</param>
public sealed record ApiProblemDetails(
    string Title,
    int Status,
    string Code,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    IReadOnlyDictionary<string, object?>? Params,
    string TraceId);
