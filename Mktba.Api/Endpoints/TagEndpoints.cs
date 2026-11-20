using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Services;

namespace Mktba.Api.Endpoints;

public static class TagEndpoints
{
    private const string NameErrors =
        "A bad name answers 400 tag_name_required, tag_name_too_long (params.maxLength) or tag_name_invalid (a comma or control characters).";

    public static IEndpointRouteBuilder MapTagEndpoints(this IEndpointRouteBuilder builder)
    {
        var group = builder.MapGroup("/tags").WithTags("Tags");

        group.MapGet("/", async (string? locale, TagService service, CancellationToken ct) =>
                Results.Ok(await service.ListAsync(locale, ct)))
            .WithSummary("Every tag with the number of articles carrying it, for the admin (M-06, #70).")
            .WithDescription(
                "Ordered by language, then name. locale, when given, lists one language (an unsupported one answers 400 "
                + "locale_unsupported). articleCount counts articles of any status; a tag no article carries any more has 0.")
            .Produces<List<TagDto>>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest)
            .RequireAuthorization(Policies.CanEditAnyArticle);

        group.MapGet("/{slug}", async (
                string slug, string? locale, int? page, int? pageSize, TagService service, CancellationToken ct) =>
                Results.Ok(await service.GetPageAsync(slug, locale, page ?? 1, pageSize ?? TagService.DefaultPageSize, ct)))
            .WithSummary("A tag and the articles carrying it, for the tag page.")
            .WithDescription(
                "Only articles a reader can open: Published, not under a non-Published parent, and not empty stubs; ordered by "
                + "publishedAt, latest first. The same answer for every caller. Answers 404 tag_not_found when the language has no "
                + "tag with this slug or no such article carries it. locale defaults to ru (an unsupported one answers 400 "
                + "locale_unsupported); page starts at 1; pageSize is 20 by default, kept within 1 to 50.")
            .Produces<TagPageDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound);

        group.MapPut("/{id:int}", async (int id, TagRenameDto dto, TagService service, CancellationToken ct) =>
                Results.Ok(await service.RenameAsync(id, dto, ct)))
            .WithSummary("Renames a tag on every article carrying it (admins only).")
            .WithDescription(
                NameErrors + " A name another tag of the language has (ignoring case, ё as е) answers 400 tag_name_taken with "
                + "params.id: merge the two instead. slug null or blank keeps the current one; a new one must be valid "
                + "(tag_slug_invalid) and free in the language (tag_slug_taken). The old slug is not kept. No revision is written "
                + "and updatedAt does not change.")
            .Produces<TagDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditAnyArticle);

        group.MapPost("/{id:int}/merge", async (int id, TagMergeDto dto, TagService service, CancellationToken ct) =>
                Results.Ok(await service.MergeAsync(id, dto, ct)))
            .WithSummary("Merges a tag into another and deletes it (admins only).")
            .WithDescription(
                "Every article carrying the tag carries intoTagId instead, at the same place; the answer is the remaining tag. "
                + "Fails with 400 tag_merge_into_itself or tag_merge_locale_mismatch, 404 tag_not_found for either tag. "
                + "No revision is written and updatedAt does not change.")
            .Produces<TagDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditAnyArticle);

        return builder;
    }
}
