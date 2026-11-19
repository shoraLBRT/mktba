using Mktba.Application.DTOs;
using Mktba.Application.Services;

namespace Mktba.Api.Endpoints
{
    public static class ArticleEndpoints
    {
        public static IEndpointRouteBuilder MapArticleEndpoints(this IEndpointRouteBuilder builder)
        {
            var group = builder.MapGroup("/articles").WithTags("Articles");

            group.MapGet("/", async (ArticleService service) =>
            {
                var articles = await service.GetAllAsync();
                return Results.Ok(articles);
            }).Produces<List<ArticleReadDto>>();

            group.MapGet("/{id:int}", async (int id, ArticleService service) =>
            {
                var article = await service.GetByIdAsync(id);
                return article is not null ? Results.Ok(article) : Results.NotFound();
            }).Produces<ArticleReadDto>().Produces(StatusCodes.Status404NotFound);

            group.MapPost("/", async (ArticleCreateDto createDto, ArticleService service) =>
            {
                var createdArticle = await service.CreateAsync(createDto);
                return Results.Created($"/articles/{createdArticle.Id}", createdArticle);
            }).Produces<ArticleReadDto>(StatusCodes.Status201Created).RequireAuthorization("AdminOnly");

            group.MapPut("/{id:int}", async (int id, ArticleUpdateDto updateDto, ArticleService service) =>
            {
                await service.UpdateAsync(id, updateDto);
                return Results.NoContent();
            }).Produces(StatusCodes.Status204NoContent).RequireAuthorization("AdminOnly");

            group.MapDelete("/{id:int}", async (int id, ArticleService service) =>
            {
                await service.DeleteAsync(id);
                return Results.NoContent();
            }).Produces(StatusCodes.Status204NoContent).RequireAuthorization("AdminOnly");

            return builder;
        }
    }
}
