using Mktba.Application.DTOs;
using Mktba.Application.Services;

namespace Mktba.Api.Endpoints
{
    public static class ParagraphEndpoints
    {
        public static IEndpointRouteBuilder MapParagraphEndpoints(this IEndpointRouteBuilder builder)
        {
            var group = builder.MapGroup("/paragraph").WithTags("Paragraphs");

            group.MapGet("/", async (ParagraphService service) =>
            {
                var paragraphs = await service.GetAllAsync();
                return Results.Ok(paragraphs);
            }).Produces<List<ParagraphReadDto>>().RequireAuthorization("AdminOnly");

            group.MapGet("/{id}", async (int id, ParagraphService service) =>
            {
                var paragraph = await service.GetByIdAsync(id);
                return paragraph is not null ? Results.Ok(paragraph) : Results.NotFound();
            }).Produces<ParagraphReadDto>().Produces(StatusCodes.Status404NotFound).RequireAuthorization("AdminOnly");

            group.MapPost("/", async (ParagraphCreateDto createDto, ParagraphService service) =>
            {
                var createdParagraph = await service.CreateAsync(createDto);
                return Results.Created($"/paragraph/{createdParagraph!.Id}", createdParagraph);
            }).Produces<ParagraphReadDto>(StatusCodes.Status201Created).RequireAuthorization("AdminOnly");

            group.MapPut("/{id}", async (int id, ParagraphUpdateDto updateDto, ParagraphService service) =>
            {
                await service.UpdateAsync(id, updateDto);
                return Results.NoContent();
            }).Produces(StatusCodes.Status204NoContent).RequireAuthorization("AdminOnly");

            group.MapDelete("/{id}", async (int id, ParagraphService service) =>
            {
                await service.DeleteAsync(id);
                return Results.NoContent();
            }).Produces(StatusCodes.Status204NoContent).RequireAuthorization("AdminOnly");

            return builder;
        }
    }
}
