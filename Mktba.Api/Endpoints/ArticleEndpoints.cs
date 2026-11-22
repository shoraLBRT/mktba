using System.Security.Claims;
using Mktba.Api.Infrastructure;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Api.Endpoints
{
    public static class ArticleEndpoints
    {
        public static IEndpointRouteBuilder MapArticleEndpoints(this IEndpointRouteBuilder builder)
        {
            var group = builder.MapGroup("/articles").WithTags("Articles");

            group.MapGet("/", async (ClaimsPrincipal user, ArticleService service) =>
            {
                var articles = await service.GetAllAsync(user.ToArticleViewer());
                return Results.Ok(articles);
            }).Produces<List<ArticleReadDto>>();

            group.MapGet("/admin-list", async (
                ClaimsPrincipal user,
                ArticleService service,
                string? search,
                ArticleStatus? status,
                int? authorId,
                string? tag,
                string? locale,
                ArticleListSort? sort,
                SortDirection? dir,
                int? page,
                int? pageSize,
                bool? mine) =>
                Results.Ok(await service.GetListAsync(
                    new ArticleListQuery(
                        search, status, authorId, tag, locale,
                        sort ?? ArticleListSort.UpdatedAt, dir ?? SortDirection.Desc,
                        page ?? 1, pageSize ?? ArticleService.DefaultPageSize, mine ?? false),
                    user.ToArticleViewer())))
            .WithSummary("One page of the admin article list, filtered and sorted.")
            .WithDescription(
                "Lists the articles the caller may see (an author: Published ones plus their own), without "
                + "their content. search matches the title or slug case-insensitively; status, authorId, tag "
                + "(one whole tag) and locale filter exactly; mine=true keeps only the articles the caller writes or co-writes. "
                + "Each item gives lastStatusChange (the latest move and its comment) when the caller may edit the article. sort is UpdatedAt (default), CreatedAt, "
                + "PublishedAt (never-published last), Title or Status (workflow order); dir is Desc (default) "
                + "or Asc; enum values are case-sensitive names. page is 1-based; pageSize defaults to 20 and is kept within 1 to 100.")
            .Produces<ArticleListPageDto>()
            .RequireAuthorization(Policies.CanEditArticles);

            group.MapGet("/summary", async (ClaimsPrincipal user, ArticleService service, CancellationToken cancellationToken) =>
                Results.Ok(await service.GetSummaryAsync(user.ToArticleViewer(), cancellationToken)))
            .WithSummary("Article counts for the admin dashboard.")
            .WithDescription(
                "Counts the articles the caller may see (an author: Published ones plus their own): the total, "
                + "those with content (an opinion, an infobox or a summary, the rule of hasContent) and without, "
                + "and the number in each status. Counted in the database; no article content is loaded.")
            .Produces<ArticleSummaryDto>()
            .RequireAuthorization(Policies.CanEditArticles);

            group.MapPost("/bulk/status", async (ArticleBulkStatusDto dto, ClaimsPrincipal user, ArticleService service, ArticleAccessGuard guard) =>
            {
                var ids = dto.Ids.Distinct().ToList();
                if (ids.Count > ArticleService.MaxPageSize)
                {
                    return ApiProblemResults.Problem(StatusCodes.Status400BadRequest, AppErrors.ArticleBulkTooMany(ArticleService.MaxPageSize));
                }

                var result = new ArticleBulkResultDto();
                foreach (var id in ids)
                {
                    result.Results.Add(await ChangeStatusOfOneAsync(id, dto.Status, user, service, guard));
                }

                return Results.Ok(result);
            })
            .WithSummary("Moves several articles to one status, each checked like a single move.")
            .WithDescription(
                "Applies POST /articles/{id}/status to each id in turn and saves each move on its own, so "
                + "some may succeed while others fail. Each result carries ok, or the error code the single "
                + "move would answer: article_not_found, forbidden or article_status_transition_invalid. "
                + "More than 100 distinct ids answers 400 article_bulk_too_many.")
            .Produces<ArticleBulkResultDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest)
            .RequireAuthorization(Policies.CanEditArticles);

            group.MapGet("/sitemap", async (SitemapService service, CancellationToken cancellationToken) =>
                Results.Ok(await service.GetArticlesAsync(cancellationToken)))
            .WithDescription(
                "Every article search engines are pointed at: Published, not noindex, and not under a "
                + "non-Published parent. The same list for every caller; no content.")
            .Produces<List<SitemapArticleDto>>();

            group.MapGet("/recent", async (string? locale, int? limit, RecentArticlesService service, CancellationToken cancellationToken) =>
                Results.Ok(await service.GetAsync(locale, limit ?? RecentArticlesService.DefaultLimit, cancellationToken)))
            .WithSummary("The newest and the most recently updated articles, for the home page.")
            .WithDescription(
                "Two lists of articles a reader can open: Published, not under a non-Published parent, and "
                + "not empty stubs. new is ordered by publishedAt, updated holds the articles saved after "
                + "they were published, ordered by updatedAt; both latest first. The same lists for every "
                + "caller; no content. locale defaults to ru (an unsupported one answers 400 "
                + "locale_unsupported); limit is the size of each list, 6 by default, kept within 1 to 20.")
            .Produces<RecentArticlesDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest);

            group.MapGet("/{id:int}", async (int id, ClaimsPrincipal user, ArticleService service) =>
            {
                var article = await service.GetByIdAsync(id, user.ToArticleViewer());
                return article is not null
                    ? Results.Ok(article)
                    : ApiProblemResults.Problem(StatusCodes.Status404NotFound, AppErrors.ArticleNotFound);
            }).Produces<ArticleReadDto>().ProducesApiProblem(StatusCodes.Status404NotFound);

            group.MapPost("/", async (ArticleCreateDto createDto, ClaimsPrincipal user, ArticleService service) =>
            {
                var createdArticle = await service.CreateAsync(createDto, user.GetUserId());
                return Results.Created($"/articles/{createdArticle.Id}", createdArticle);
            })
            .WithSummary("Creates an empty article (a section of the tree) with a title and a parent.")
            .WithDescription(
                "The title is trimmed; an empty one answers 400 article_title_required. The article is a "
                + "Draft, placed last under the parent, with a slug made from the title.")
            .Produces<ArticleReadDto>(StatusCodes.Status201Created)
            .ProducesApiProblem(StatusCodes.Status400BadRequest)
            .RequireAuthorization(Policies.CanEditArticles);

            group.MapPut("/{id:int}", async (int id, ArticleUpdateDto updateDto, ArticleService service) =>
            {
                await service.UpdateAsync(id, updateDto);
                return Results.NoContent();
            })
            .WithSummary("Renames an article and sets its parent.")
            .WithDescription(
                "Sets the title (trimmed; an empty one answers 400 article_title_required) and the parent: "
                + "send the current parent to only rename. A changed parent is checked like "
                + "POST /articles/{id}/move (article_parent_not_found, article_move_cycle) and places the "
                + "article last under it. The slug is kept; no revision is written, UpdatedAt is set.")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditAnyArticle);

            group.MapPost("/{id:int}/status", async (int id, ArticleStatusChangeDto dto, ClaimsPrincipal user, ArticleService service, ArticleAccessGuard guard) =>
                await guard.CheckAsync(user, id, ArticleOperationRequirement.ChangeStatus(dto.Status))
                ?? Results.Ok(await service.ChangeStatusAsync(id, dto.Status, user.ToArticleViewer(), user.GetUserId(), dto.Comment)))
            .WithSummary("Moves an article to another status.")
            .WithDescription(
                "Allowed: Draft → InReview, InReview → Published, InReview → Draft, Published → Archived, "
                + "Archived → Draft. Any other move answers 400 article_status_transition_invalid. Admins "
                + "make every move; an author only Draft → InReview and InReview → Draft on an article they "
                + "wrote or co-author, anything else answers 403 forbidden (404 article_not_found for "
                + "someone else's draft). The optional comment (trimmed, at most 2000 characters, else 400 "
                + "article_status_comment_too_long) is kept with the move in the article's status log, such as "
                + "a reviewer's reason for returning the article; the answer's lastStatusChange is that move.")
            .Produces<ArticleReadDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status403Forbidden, StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditArticles);

            group.MapGet("/review-queue", async (string? locale, ArticleService service) =>
                Results.Ok(await service.GetReviewQueueAsync(locale)))
            .WithSummary("The moderation queue: every article waiting for review.")
            .WithDescription(
                "Lists the InReview articles, submitted longest ago first, without content. Each gives the "
                + "newest revision (what approval publishes) and the revision last published, if any, so the "
                + "two can be compared through GET /articles/{id}/revisions/compare. locale filters to one "
                + "language (an unsupported one answers 400 locale_unsupported); without it every language is listed. "
                + "Approve or return through POST /articles/{id}/status.")
            .Produces<List<ReviewQueueItemDto>>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest)
            .RequireAuthorization(Policies.CanReviewArticles);

            group.MapPost("/{id:int}/move", async (int id, ArticleMoveDto dto, ArticleService service) =>
                Results.Ok(await service.MoveAsync(id, dto)))
            .WithSummary("Moves an article to another parent and/or position among its siblings.")
            .WithDescription(
                "Places the article at the 0-based index among the new parent's other children (null or "
                + "past the end appends) and renumbers both sibling lists. Answers 400 article_parent_not_found "
                + "for an unknown parent and 400 article_move_cycle for the article itself or a descendant. "
                + "Writes no revision and does not change UpdatedAt.")
            .Produces<ArticleReadDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditAnyArticle);

            group.MapGet("/{id:int}/authors", async (int id, ArticleAuthorshipService service) =>
                Results.Ok(await service.GetAsync(id)))
            .WithSummary("The article's author and co-authors.")
            .Produces<ArticleAuthorsDto>()
            .ProducesApiProblem(StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditAnyArticle);

            group.MapPut("/{id:int}/authors", async (int id, ArticleAuthorsDto dto, ArticleAuthorshipService service) =>
                Results.Ok(await service.SetAsync(id, dto)))
            .WithSummary("Replaces the article's author and co-authors.")
            .WithDescription(
                "Duplicate co-author ids are ignored. Answers 400 user_not_found for an unknown user and "
                + "400 article_coauthor_is_author when the author is also listed as co-author.")
            .Produces<ArticleAuthorsDto>()
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditAnyArticle);

            group.MapDelete("/{id:int}", async (int id, ClaimsPrincipal user, ArticleService service) =>
            {
                await service.MoveToTrashAsync(id, user.GetUserId());
                return Results.NoContent();
            })
            .WithSummary("Moves the article to the trash.")
            .WithDescription(
                "The article disappears from the site, the tree, search and every list; its slug stays reserved "
                + "and its content, revisions, drafts and files are kept. If it had been published, reading it by "
                + "slug answers 410 article_gone. Answers 400 article_has_children while it has children outside "
                + "the trash, 404 article_not_found when there is no such article outside the trash.")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditAnyArticle);

            group.MapGet("/trash", async (ArticleService service, CancellationToken cancellationToken) =>
                Results.Ok(await service.GetTrashAsync(cancellationToken)))
            .WithSummary("The trashed articles, most recently trashed first.")
            .Produces<List<ArticleTrashItemDto>>()
            .RequireAuthorization(Policies.CanEditAnyArticle);

            group.MapPost("/trash/{id:int}/restore", async (int id, ClaimsPrincipal user, ArticleService service) =>
            {
                await service.RestoreAsync(id, user.GetUserId());
                return Results.NoContent();
            })
            .WithSummary("Takes the article out of the trash.")
            .WithDescription(
                "It comes back with the status, slug and content it had, last among its parent's children (the "
                + "root's, when the parent was purged). Answers 400 article_parent_in_trash while the parent is "
                + "in the trash, 404 article_not_in_trash when the article is not there.")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditAnyArticle);

            group.MapDelete("/trash/{id:int}", async (int id, ClaimsPrincipal user, ArticleService service) =>
            {
                await service.PurgeAsync(id, user.GetUserId());
                return Results.NoContent();
            })
            .WithSummary("Deletes a trashed article for good.")
            .WithDescription(
                "Removes it with its content, revisions and drafts; this cannot be undone. If it was ever "
                + "published, its current and old slugs are recorded, so reading them by slug answers 410 "
                + "article_gone until another article takes the slug. Its children still in the trash move to "
                + "the root. Answers 404 article_not_in_trash when the article is not in the trash.")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesApiProblem(StatusCodes.Status404NotFound)
            .RequireAuthorization(Policies.CanEditAnyArticle);

            return builder;
        }

        private static async Task<ArticleBulkItemResultDto> ChangeStatusOfOneAsync(
            int id, ArticleStatus target, ClaimsPrincipal user, ArticleService service, ArticleAccessGuard guard)
        {
            if (await guard.FindRefusalAsync(user, id, ArticleOperationRequirement.ChangeStatus(target)) is { } refusal)
            {
                return new ArticleBulkItemResultDto { Id = id, Ok = false, Code = refusal.Error.Code };
            }

            try
            {
                await service.ChangeStatusAsync(id, target, user.ToArticleViewer(), user.GetUserId());
                return new ArticleBulkItemResultDto { Id = id, Ok = true };
            }
            catch (AppException failure)
            {
                return new ArticleBulkItemResultDto { Id = id, Ok = false, Code = failure.Error.Code };
            }
        }
    }
}
