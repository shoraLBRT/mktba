using System.Globalization;
using System.Security.Claims;
using Mktba.Application.Exceptions;
using Mktba.Api.Infrastructure;

namespace Mktba.Api.Middleware;

public sealed class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception exception)
        {
            await HandleExceptionAsync(context, exception);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        var (statusCode, error) = exception switch
        {
            AppException appException => (appException.StatusCode, appException.Error),
            // Unreadable request bodies and route values; RouteHandlerOptions.ThrowOnBadRequest routes them here.
            BadHttpRequestException badRequest => (badRequest.StatusCode, AppErrors.BadRequest),
            _ => (StatusCodes.Status500InternalServerError, AppErrors.InternalError),
        };

        if (statusCode >= StatusCodes.Status500InternalServerError)
        {
            _logger.LogError(
                exception,
                "Unhandled exception. StatusCode: {StatusCode}, Method: {Method}, Path: {Path}, TraceId: {TraceId}, UserId: {UserId}",
                statusCode,
                context.Request.Method,
                context.Request.Path,
                context.TraceIdentifier,
                GetUserId(context));
        }
        else
        {
            _logger.LogWarning(
                exception,
                "Handled exception. StatusCode: {StatusCode}, Method: {Method}, Path: {Path}, TraceId: {TraceId}, UserId: {UserId}",
                statusCode,
                context.Request.Method,
                context.Request.Path,
                context.TraceIdentifier,
                GetUserId(context));
        }

        if (context.Response.HasStarted)
        {
            _logger.LogWarning(
                "Could not write problem response because the response already started. Method: {Method}, Path: {Path}, TraceId: {TraceId}",
                context.Request.Method,
                context.Request.Path,
                context.TraceIdentifier);
            return;
        }

        if (exception is TooManyRequestsException { RetryAfter: { } retryAfter })
        {
            context.Response.Headers.RetryAfter =
                Math.Max(1, (long)Math.Ceiling(retryAfter.TotalSeconds)).ToString(CultureInfo.InvariantCulture);
        }

        await ProblemHttpResponseWriter.WriteAsync(context, statusCode, error);
    }

    private static string? GetUserId(HttpContext context)
    {
        return context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
    }
}
