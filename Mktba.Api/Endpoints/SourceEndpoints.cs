using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Services;
using Mktba.Domain.Entities;

namespace Mktba.Api.Endpoints;

public static class SourceEndpoints
{
    public static IEndpointRouteBuilder MapSourceEndpoints(this IEndpointRouteBuilder builder)
    {
        var group = builder.MapGroup("/sources").WithTags("Sources");

        group.MapGet("/", async (string? q, SourceKind? kind, int? limit, SourceService service, CancellationToken ct) =>
            Results.Ok(await service.SearchAsync(q, kind, limit ?? SourceService.DefaultLimit, ct)))
            .WithSummary("The directory of sources, for the picker in the article editor.")
            .WithDescription(
                "Entries whose title or author contains q (case-insensitive; no q lists the directory from "
                + "the start), optionally of one kind, ordered by title. limit is 20 by default, kept "
                + "within 1 to 50. Readers do not need it: the content of an article carries the sources it cites.")
            .Produces<List<SourceDto>>()
            .RequireAuthorization(Policies.CanEditArticles);

        group.MapPost("/", async (SourceWriteDto dto, SourceService service, CancellationToken ct) =>
        {
            var created = await service.CreateAsync(dto, ct);
            return Results.Created($"/sources/{created.Id}", created);
        })
            .WithSummary("Adds an entry to the directory of sources.")
            .WithDescription(
                "An entry of the same kind with the same title and author (ignoring case) fails with "
                + "source_duplicate, whose params.id names the existing one.")
            .Produces<SourceDto>(StatusCodes.Status201Created)
            .ProducesApiProblem(StatusCodes.Status400BadRequest)
            .RequireAuthorization(Policies.CanEditArticles);

        group.MapPut("/{id:int}", async (int id, SourceWriteDto dto, SourceService service, CancellationToken ct) =>
            Results.Ok(await service.UpdateAsync(id, dto, ct)))
            .WithSummary("Replaces a directory entry (admins only: it changes every article that cites it).")
            .WithDescription("Saved revisions keep the source as it was when they were written.")
            .Produces<SourceDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditAnyArticle);

        group.MapDelete("/{id:int}", async (int id, SourceService service, CancellationToken ct) =>
        {
            await service.DeleteAsync(id, ct);
            return Results.NoContent();
        })
            .WithSummary("Deletes a directory entry that no opinion cites (admins only).")
            .WithDescription("A cited entry fails with source_in_use (params.count citations): remove the citations first.")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditAnyArticle);

        return builder;
    }
}
