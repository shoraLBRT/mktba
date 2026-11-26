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

        // GET /schools/custom — the directory of scholar opinions authors pick from
        group.MapGet("/custom", async (SchoolService service, CancellationToken ct) =>
        {
            var schools = await service.GetCustomSchoolsAsync(ct);
            return Results.Ok(schools);
        })
            .WithSummary("The directory of scholar opinions (M-08, #116): every custom school, by name.")
            .WithDescription(
                "Any article may link its opinions to any of them. scholarArticle is set only while the article "
                + "about the scholar is Published.")
            .Produces<List<SchoolDto>>()
            .RequireAuthorization(Policies.CanEditArticles);

        // GET /schools/article/{articleId} — scholar opinions an article has
        group.MapGet("/article/{articleId:int}", async (int articleId, ClaimsPrincipal user, SchoolService service, CancellationToken ct) =>
        {
            var schools = await service.GetByArticleIdAsync(articleId, user.ToArticleViewer(), ct);
            return Results.Ok(schools);
        })
            .WithSummary("Scholar opinions (custom schools) of one article: created for it or used by its opinions.")
            .WithDescription(
                "An article that is not Published answers 404 article_not_found except to an admin or its "
                + "own author or co-author, as the other article reads do; so does an article that does not exist. "
                + "scholarArticle is set only while the article about the scholar is Published.")
            .Produces<List<SchoolDto>>()
            .ProducesApiProblem(StatusCodes.Status404NotFound);

        // POST /schools — create a scholar opinion, for an article the caller may edit or straight into the directory
        group.MapPost("/", async (SchoolCreateDto dto, ClaimsPrincipal user, ArticleAccessGuard guard, SchoolService service, CancellationToken ct) =>
        {
            if (dto.ArticleScopeId is int articleId
                && await guard.CheckAsync(user, articleId, ArticleOperationRequirement.Edit) is { } denied)
                return denied;

            var created = await service.CreateCustomSchoolAsync(dto, ct);
            return Results.Created($"/schools/{created.Id}", created);
        })
            .WithSummary("Creates a scholar opinion: for an article (admins any, authors their own) or, with no articleScopeId, into the directory.")
            .WithDescription(
                "slug may be left out (the server makes one). Editors of articleScopeId may later change or delete "
                + "the entry while no other article uses it; otherwise only an admin may.")
            .Produces<SchoolDto>(StatusCodes.Status201Created)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status403Forbidden, StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditArticles);

        // PUT /schools/{id} — change a scholar opinion
        group.MapPut("/{id:int}", async (int id, SchoolUpdateDto dto, ClaimsPrincipal user, ArticleAccessGuard guard, SchoolService service, CancellationToken ct) =>
        {
            if (await guard.CheckSchoolAsync(user, id) is { } denied)
                return denied;

            return Results.Ok(await service.UpdateCustomSchoolAsync(id, dto, ct));
        })
            .WithSummary("Changes a scholar opinion (M-08, #116) in every article that uses it.")
            .WithDescription(
                "Admins any; others one created for an article they may edit, while no other article uses it "
                + "(409 school_in_use). System schools answer 400 system_school_update_forbidden.")
            .Produces<SchoolDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status403Forbidden, StatusCodes.Status404NotFound, StatusCodes.Status409Conflict)
            .RequireAuthorization(Policies.CanEditArticles);

        // DELETE /schools/{id} — delete a scholar opinion
        group.MapDelete("/{id:int}", async (int id, ClaimsPrincipal user, ArticleAccessGuard guard, SchoolService service, CancellationToken ct) =>
        {
            if (await guard.CheckSchoolAsync(user, id) is { } denied)
                return denied;

            await service.DeleteCustomSchoolAsync(id, ct);
            return Results.NoContent();
        })
            .WithSummary("Deletes a scholar opinion and its links: admins any, others one created for their article that no other article uses.")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status403Forbidden, StatusCodes.Status404NotFound, StatusCodes.Status409Conflict)
            .RequireAuthorization(Policies.CanEditArticles);

        return builder;
    }
}
