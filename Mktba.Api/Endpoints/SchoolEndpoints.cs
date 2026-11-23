using System.Security.Claims;
using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Services;

namespace Mktba.Api.Endpoints;

public static class SchoolEndpoints
{
    public static IEndpointRouteBuilder MapSchoolEndpoints(this IEndpointRouteBuilder builder)
    {
        var group = builder.MapGroup("/schools").WithTags("Schools");

        // GET /schools/system — all 4 canonical mazhabs, named in the reader's language
        group.MapGet("/system", async (string? locale, SchoolService service, CancellationToken ct) =>
        {
            var schools = await service.GetSystemSchoolsAsync(locale, ct);
            return Results.Ok(schools);
        })
            .WithSummary("The four canonical schools, named in one language (I-07, #111).")
            .WithDescription(
                "locale defaults to ru (an unsupported one answers 400 locale_unsupported). name and shortName are "
                + "the school's names in that language, or the Russian ones when the school has no translation into "
                + "it; id and slug are the same in every language.")
            .Produces<List<SchoolDto>>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest);

        // GET /schools/article/{articleId} — custom schools scoped to an article
        group.MapGet("/article/{articleId:int}", async (int articleId, ClaimsPrincipal user, SchoolService service, CancellationToken ct) =>
        {
            var schools = await service.GetByArticleIdAsync(articleId, user.ToArticleViewer(), ct);
            return Results.Ok(schools);
        })
            .WithSummary("Custom schools of one article.")
            .WithDescription(
                "An article that is not Published answers 404 article_not_found except to an admin or its "
                + "own author or co-author, as the other article reads do; so does an article that does not exist.")
            .Produces<List<SchoolDto>>()
            .ProducesApiProblem(StatusCodes.Status404NotFound);

        // POST /schools — create a custom school for an article the caller may edit
        group.MapPost("/", async (SchoolCreateDto dto, ClaimsPrincipal user, ArticleAccessGuard guard, SchoolService service, CancellationToken ct) =>
        {
            if (await guard.CheckAsync(user, dto.ArticleScopeId, ArticleOperationRequirement.Edit) is { } denied)
                return denied;

            var created = await service.CreateCustomSchoolAsync(dto, ct);
            return Results.Created($"/schools/{created.Id}", created);
        })
            .WithSummary("Creates a custom school for one article: admins for any article, authors for their own.")
            .Produces<SchoolDto>(StatusCodes.Status201Created)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status403Forbidden, StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditArticles);

        // DELETE /schools/{id} — delete a custom school of an article the caller may edit
        group.MapDelete("/{id:int}", async (int id, ClaimsPrincipal user, ArticleAccessGuard guard, SchoolService service, CancellationToken ct) =>
        {
            if (await guard.CheckSchoolAsync(user, id) is { } denied)
                return denied;

            await service.DeleteCustomSchoolAsync(id, ct);
            return Results.NoContent();
        })
            .WithSummary("Deletes a custom school: admins any, authors those of their own articles.")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status403Forbidden, StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditArticles);

        return builder;
    }
}
