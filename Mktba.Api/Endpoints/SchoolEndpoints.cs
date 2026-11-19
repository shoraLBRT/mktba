using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Services;

namespace Mktba.Api.Endpoints;

public static class SchoolEndpoints
{
    public static IEndpointRouteBuilder MapSchoolEndpoints(this IEndpointRouteBuilder builder)
    {
        var group = builder.MapGroup("/schools").WithTags("Schools");

        // GET /schools/system — all 4 canonical mazhabs
        group.MapGet("/system", async (SchoolService service, CancellationToken ct) =>
        {
            var schools = await service.GetSystemSchoolsAsync(ct);
            return Results.Ok(schools);
        }).Produces<List<SchoolDto>>();

        // GET /schools/article/{articleId} — custom schools scoped to an article
        group.MapGet("/article/{articleId:int}", async (int articleId, SchoolService service, CancellationToken ct) =>
        {
            var schools = await service.GetByArticleIdAsync(articleId, ct);
            return Results.Ok(schools);
        }).Produces<List<SchoolDto>>();

        // POST /schools — create a custom school for an article (admin only)
        group.MapPost("/", async (SchoolCreateDto dto, SchoolService service, CancellationToken ct) =>
        {
            var created = await service.CreateCustomSchoolAsync(dto, ct);
            return Results.Created($"/schools/{created.Id}", created);
        })
            .Produces<SchoolDto>(StatusCodes.Status201Created)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditAnyArticle);

        // DELETE /schools/{id} — delete a custom school (admin only)
        group.MapDelete("/{id:int}", async (int id, SchoolService service, CancellationToken ct) =>
        {
            await service.DeleteCustomSchoolAsync(id, ct);
            return Results.NoContent();
        })
            .Produces(StatusCodes.Status204NoContent)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditAnyArticle);

        return builder;
    }
}
