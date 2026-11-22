using Microsoft.AspNetCore.Mvc;
using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Services.Observability;

namespace Mktba.Api.Endpoints;

public static class ClientErrorEndpoints
{
    /// <summary>A report is a message and a stack: anything bigger is not one.</summary>
    public const long MaxBodyBytes = 16 * 1024;

    public static IEndpointRouteBuilder MapClientErrorEndpoints(this IEndpointRouteBuilder builder)
    {
        builder.MapPost("/client-errors", (ClientErrorReportDto report, ClientErrorService service) =>
            {
                service.Report(report);
                return Results.Accepted();
            })
            .WithTags("Observability")
            .WithSummary("Takes a browser error report from the site's own script (X-05). No sign-in.")
            .WithDescription(
                "The report is cleaned (no e-mail addresses, no query strings, no tokens) and written to the "
                + "server log; nothing is stored and no address or User-Agent is kept. Always 202 for a readable "
                + "body, also when the report is dropped by the overall cap. 429 with Retry-After: too_many_requests.")
            .Produces(StatusCodes.Status202Accepted)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status429TooManyRequests)
            .WithMetadata(new RequestSizeLimitAttribute(MaxBodyBytes))
            .RequireRateLimiting(RateLimitingSetup.ClientErrorsPolicy);

        return builder;
    }
}
