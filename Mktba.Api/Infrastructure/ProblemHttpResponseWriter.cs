using System.Text.Json;
using Mktba.Application.Exceptions;

namespace Mktba.Api.Infrastructure;

internal static class ProblemHttpResponseWriter
{
    public const string ContentType = "application/problem+json";

    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    public static Task WriteAsync(
        HttpContext context,
        int statusCode,
        AppError error,
        CancellationToken cancellationToken = default)
    {
        context.Response.StatusCode = statusCode;
        context.Response.ContentType = ContentType;

        var problem = new ApiProblemDetails(error.Message, statusCode, error.Code, error.Params, context.TraceIdentifier);
        return context.Response.WriteAsync(JsonSerializer.Serialize(problem, SerializerOptions), cancellationToken);
    }
}
