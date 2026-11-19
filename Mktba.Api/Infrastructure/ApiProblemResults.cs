using Mktba.Application.Exceptions;

namespace Mktba.Api.Infrastructure;

internal static class ApiProblemResults
{
    /// <summary>An endpoint result that writes <paramref name="error"/> as an <see cref="ApiProblemDetails"/> body.</summary>
    public static IResult Problem(int statusCode, AppError error) => new ProblemResult(statusCode, error);

    /// <summary>Documents error responses with the <see cref="ApiProblemDetails"/> schema.</summary>
    public static RouteHandlerBuilder ProducesApiProblem(this RouteHandlerBuilder builder, params int[] statusCodes)
    {
        foreach (var statusCode in statusCodes)
        {
            builder.Produces<ApiProblemDetails>(statusCode, ProblemHttpResponseWriter.ContentType);
        }

        return builder;
    }

    private sealed class ProblemResult(int statusCode, AppError error) : IResult
    {
        public Task ExecuteAsync(HttpContext httpContext) =>
            ProblemHttpResponseWriter.WriteAsync(httpContext, statusCode, error, httpContext.RequestAborted);
    }
}
