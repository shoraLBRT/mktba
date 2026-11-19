using Mktba.Application.DTOs;
using Mktba.Application.Services;

namespace Mktba.Api.Endpoints
{
    public static class ArticleContentEndpoints
    {
        public static IEndpointRouteBuilder MapArticleContentEndpoints(this IEndpointRouteBuilder builder)
        {
            var group = builder.MapGroup("/articles").WithTags("ArticleContent");

            group.MapGet("/{id:int}/content", async (int id, ArticleContentService service) =>
            {
                var content = await service.GetContentByArticleIdAsync(id);
                return Results.Ok(content);
            }).Produces<ArticleContentDto>();

            group.MapPost("/content", async (ArticleContentCreateDto dto, ArticleContentService service) =>
            {
                var article = await service.CreateArticleWithContentAsync(dto);
                return Results.Created($"/articles/{article.Id}/content", article);
            }).Produces<ArticleContentDto>(StatusCodes.Status201Created).RequireAuthorization("AdminOnly");

            group.MapPut("/{id:int}/content", async (int id, ArticleContentDto dto, ArticleContentService service) =>
            {
                var (success, errorMessage) = await service.UpdateContentAsync(id, dto);
                return success ? Results.NoContent() : Results.BadRequest(errorMessage);
            }).Produces(StatusCodes.Status204NoContent).Produces(StatusCodes.Status400BadRequest).RequireAuthorization("AdminOnly");

            return builder;
        }
    }
}
