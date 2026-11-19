using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Services.Feedback;

namespace Mktba.Api.Endpoints;

public static class FeedbackEndpoints
{
    public static IEndpointRouteBuilder MapFeedbackEndpoints(this IEndpointRouteBuilder builder)
    {
        builder.MapPost("/feedback", async (FeedbackCreateDto dto, FeedbackService service, CancellationToken ct) =>
            Results.Accepted(value: await service.SubmitAsync(dto, ct)))
            .WithTags("Feedback")
            .WithSummary("Accepts a visitor's message: an article error, a site problem or an idea. No sign-in.")
            .WithDescription(
                "The message is stored and answered with 202 at once; an issue in the project's public GitHub "
                + "repository is created in the background and retried while GitHub is unavailable, so the "
                + "answer does not depend on GitHub. The contact is kept only in the site's database and is "
                + "never published. Errors: feedback_type_invalid, feedback_text_required, "
                + "feedback_text_too_long, feedback_contact_too_long, feedback_page_url_invalid.")
            .Produces<FeedbackAcceptedDto>(StatusCodes.Status202Accepted)
            .ProducesApiProblem(StatusCodes.Status400BadRequest);

        return builder;
    }
}
