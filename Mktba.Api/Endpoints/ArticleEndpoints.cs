using System.Security.Claims;
using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Domain.Entities;

namespace Mktba.Api.Endpoints
{
    public static class ArticleEndpoints
    {
        public static IEndpointRouteBuilder MapArticleEndpoints(this IEndpointRouteBuilder builder)
        {
            var group = builder.MapGroup("/articles").WithTags("Articles");

            group.MapGet("/", async (ClaimsPrincipal user, ArticleService service) =>
            {
                var articles = await service.GetAllAsync(user.CanSeeUnpublished());
                return Results.Ok(articles);
            }).Produces<List<ArticleReadDto>>();

            group.MapGet("/{id:int}", async (int id, ClaimsPrincipal user, ArticleService service) =>
            {
                var article = await service.GetByIdAsync(id, user.CanSeeUnpublished());
                return article is not null
                    ? Results.Ok(article)
                    : ApiProblemResults.Problem(StatusCodes.Status404NotFound, AppErrors.ArticleNotFound);
            }).Produces<ArticleReadDto>().ProducesApiProblem(StatusCodes.Status404NotFound);

            group.MapPost("/", async (ArticleCreateDto createDto, ClaimsPrincipal user, ArticleService service) =>
            {
                var createdArticle = await service.CreateAsync(createDto, user.GetUserId());
                return Results.Created($"/articles/{createdArticle.Id}", createdArticle);
            }).Produces<ArticleReadDto>(StatusCodes.Status201Created).RequireAuthorization("AdminOnly");

            group.MapPut("/{id:int}", async (int id, ArticleUpdateDto updateDto, ArticleService service) =>
            {
                await service.UpdateAsync(id, updateDto);
                return Results.NoContent();
            }).Produces(StatusCodes.Status204NoContent).ProducesApiProblem(StatusCodes.Status404NotFound).RequireAuthorization("AdminOnly");

            group.MapPost("/{id:int}/status", async (int id, ArticleStatusChangeDto dto, ArticleService service) =>
            {
                var article = await service.ChangeStatusAsync(id, dto.Status);
                return Results.Ok(article);
            })
            .WithSummary("Moves an article to another status.")
            .WithDescription(
                "Allowed: Draft → InReview, InReview → Published, InReview → Draft, Published → Archived, "
                + "Archived → Draft. Any other move answers 400 article_status_transition_invalid.")
            .Produces<ArticleReadDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound)
            .RequireAuthorization("AdminOnly");

            group.MapGet("/{id:int}/authors", async (int id, ArticleAuthorshipService service) =>
                Results.Ok(await service.GetAsync(id)))
            .WithSummary("The article's author and co-authors.")
            .Produces<ArticleAuthorsDto>()
            .ProducesApiProblem(StatusCodes.Status404NotFound)
            .RequireAuthorization("AdminOnly");

            group.MapPut("/{id:int}/authors", async (int id, ArticleAuthorsDto dto, ArticleAuthorshipService service) =>
                Results.Ok(await service.SetAsync(id, dto)))
            .WithSummary("Replaces the article's author and co-authors.")
            .WithDescription(
                "Duplicate co-author ids are ignored. Answers 400 user_not_found for an unknown user and "
                + "400 article_coauthor_is_author when the author is also listed as co-author.")
            .Produces<ArticleAuthorsDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound)
            .RequireAuthorization("AdminOnly");

            group.MapDelete("/{id:int}", async (int id, ArticleService service) =>
            {
                await service.DeleteAsync(id);
                return Results.NoContent();
            }).Produces(StatusCodes.Status204NoContent).ProducesApiProblem(StatusCodes.Status404NotFound).RequireAuthorization("AdminOnly");

            return builder;
        }
    }
}
