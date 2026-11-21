using AutoMapper;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services
{
    public class ArticleService
    {
        private readonly ArticleRepository _articleRepository;
        private readonly IMapper _mapper;
        private readonly TimeProvider _clock;

        public ArticleService(ArticleRepository articleRepository, IMapper mapper, TimeProvider clock)
        {
            _articleRepository = articleRepository;
            _mapper = mapper;
            _clock = clock;
        }

        /// <summary>The articles <paramref name="viewer"/> may see, each with the status moves the viewer may make.</summary>
        public async Task<IEnumerable<ArticleReadDto>> GetAllAsync(ArticleViewer viewer)
        {
            var articles = await _articleRepository.GetAllWithParagraphsAsync(viewer);
            return articles.Select(article => ToReadDto(article, viewer)).ToList();
        }

        /// <summary>The largest page of the admin article list, and the most articles one bulk action takes.</summary>
        public const int MaxPageSize = 100;

        /// <summary>The page size of the admin article list when the request gives none.</summary>
        public const int DefaultPageSize = 20;

        /// <summary>
        /// One page of the admin article list (A-02, #34): only the articles <paramref name="viewer"/>
        /// may see, each with the status moves the viewer may make. A page below 1 is the first, the
        /// page size is kept within 1 to <see cref="MaxPageSize"/>; a page past the end is empty.
        /// </summary>
        public async Task<ArticleListPageDto> GetListAsync(ArticleListQuery query, ArticleViewer viewer)
        {
            var bounded = query with
            {
                Page = Math.Max(query.Page, 1),
                PageSize = Math.Clamp(query.PageSize, 1, MaxPageSize),
                Tag = string.IsNullOrWhiteSpace(query.Tag) ? null : TagRules.KeyOf(TagRules.Normalize(query.Tag)),
            };
            var (rows, total) = await _articleRepository.GetListPageAsync(bounded, viewer);
            var editable = rows.Where(row => viewer.CanEdit(row.AuthorId, row.CoAuthorIds)).Select(row => row.Id).ToList();
            var lastChanges = await _articleRepository.GetLatestStatusChangesAsync(editable);
            return new ArticleListPageDto
            {
                Items = rows.Select(row => ToListItemDto(row, viewer, lastChanges.GetValueOrDefault(row.Id))).ToList(),
                Total = total,
                Page = bounded.Page,
                PageSize = bounded.PageSize,
            };
        }

        private static ArticleListItemDto ToListItemDto(ArticleListRow row, ArticleViewer viewer, ArticleStatusChange? lastChange) => new()
        {
            Id = row.Id,
            Title = row.Title,
            Slug = row.Slug,
            Locale = row.Locale,
            Status = row.Status,
            AllowedTransitions = ArticleStatusTransitions.AllowedFrom(row.Status)
                .Where(target => viewer.CanChangeStatus(row.Status, target, row.AuthorId, row.CoAuthorIds))
                .ToList(),
            ParentArticleId = row.ParentArticleId,
            AuthorId = row.AuthorId,
            Tags = row.Tags.ToList(),
            ParagraphCount = row.ParagraphCount,
            CanEdit = viewer.CanEdit(row.AuthorId, row.CoAuthorIds),
            CreatedAt = row.CreatedAt,
            UpdatedAt = row.UpdatedAt,
            PublishedAt = row.PublishedAt,
            LastStatusChange = lastChange is null ? null : ToStatusChangeEntryDto(lastChange),
        };

        /// <summary>One article; one <paramref name="viewer"/> may not see counts as missing.</summary>
        public async Task<ArticleReadDto?> GetByIdAsync(int id, ArticleViewer viewer)
        {
            var article = await _articleRepository.GetByIdWithCoAuthorsAsync(id);
            return article is null || !viewer.CanSee(article)
                ? null
                : await WithLastStatusChangeAsync(ToReadDto(article, viewer), article, viewer);
        }

        /// <summary>
        /// The moderation queue (A-04, #87): every article waiting for review, submitted longest ago
        /// first, with the revisions a reviewer compares — the one last published (if any) and the newest.
        /// Who may read it is checked by the API (reviewers only).
        /// </summary>
        /// <exception cref="ValidationException">The locale is not supported (locale_unsupported).</exception>
        public async Task<List<ReviewQueueItemDto>> GetReviewQueueAsync(string? requestedLocale)
        {
            var locale = string.IsNullOrWhiteSpace(requestedLocale)
                ? null
                : Locales.Normalize(requestedLocale) ?? throw new ValidationException(AppErrors.LocaleUnsupported(requestedLocale));

            var rows = await _articleRepository.GetReviewQueueAsync(locale);
            return rows.Select(row => new ReviewQueueItemDto
            {
                Id = row.Id,
                Title = row.Title,
                Slug = row.Slug,
                Locale = row.Locale,
                AuthorId = row.AuthorId,
                AuthorDisplayName = row.AuthorDisplayName,
                SubmittedAt = row.SubmittedAt,
                UpdatedAt = row.UpdatedAt,
                PublishedAt = row.PublishedAt,
                LatestRevisionNumber = row.LatestRevisionNumber,
                PublishedRevisionNumber = row.PublishedRevisionNumber,
            }).ToList();
        }

        /// <summary>
        /// Moves the article to <paramref name="target"/> if <see cref="ArticleStatusTransitions"/> allows it.
        /// The first move to Published sets <see cref="Article.PublishedAt"/>; later ones keep it.
        /// Every move to Published records the latest revision in <see cref="Article.PublishedRevisionId"/>.
        /// A status change is not a content save and leaves <see cref="Article.UpdatedAt"/> alone.
        /// Whether the caller may make the move is checked by the API before (U-02, #30);
        /// <paramref name="viewer"/> only shapes the returned <see cref="ArticleReadDto.AllowedTransitions"/>.
        /// Every move is logged in the same save as an <see cref="ArticleStatusChange"/> (A-04, #87)
        /// with <paramref name="comment"/> (trimmed, blank = none) and the latest revision number.
        /// </summary>
        /// <param name="changedById">The user making the move, recorded in the log.</param>
        /// <exception cref="NotFoundException">The article does not exist.</exception>
        /// <exception cref="ValidationException">The transition is not allowed, or the comment is too long.</exception>
        public async Task<ArticleReadDto> ChangeStatusAsync(
            int id, ArticleStatus target, ArticleViewer viewer, int? changedById = null, string? comment = null)
        {
            var trimmedComment = string.IsNullOrWhiteSpace(comment) ? null : comment.Trim();
            if (trimmedComment is { Length: > Infrastructure.Data.MktbaDbContext.StatusChangeCommentMaxLength })
            {
                throw new ValidationException(AppErrors.ArticleStatusCommentTooLong);
            }

            var article = await _articleRepository.GetByIdWithCoAuthorsAsync(id)
                ?? throw new NotFoundException(AppErrors.ArticleNotFound);

            if (!ArticleStatusTransitions.IsAllowed(article.Status, target))
            {
                throw new ValidationException(AppErrors.ArticleStatusTransitionInvalid(article.Status, target));
            }

            var now = _clock.GetUtcNow().UtcDateTime;
            var latestRevisionNumber = await _articleRepository.GetLatestRevisionNumberAsync(id);
            await _articleRepository.AddStatusChangeAsync(new ArticleStatusChange
            {
                ArticleId = id,
                FromStatus = article.Status,
                ToStatus = target,
                ChangedById = changedById,
                ChangedAt = now,
                RevisionNumber = latestRevisionNumber == 0 ? null : latestRevisionNumber,
                Comment = trimmedComment,
            });

            article.Status = target;
            if (target == ArticleStatus.Published)
            {
                article.PublishedAt ??= now;
                article.PublishedRevisionId = await _articleRepository.GetLatestRevisionIdAsync(id);
            }

            await _articleRepository.UpdateAsync(article);
            await _articleRepository.SaveChangesAsync();
            return await WithLastStatusChangeAsync(ToReadDto(article, viewer), article, viewer);
        }

        /// <summary>Adds the latest logged move for a viewer who may edit the article; others get none.</summary>
        private async Task<ArticleReadDto> WithLastStatusChangeAsync(ArticleReadDto dto, Article article, ArticleViewer viewer)
        {
            if (!viewer.CanEdit(article))
            {
                return dto;
            }

            var change = await _articleRepository.GetLatestStatusChangeAsync(article.Id);
            dto.LastStatusChange = change is null ? null : ToStatusChangeEntryDto(change);
            return dto;
        }

        private static ArticleStatusChangeEntryDto ToStatusChangeEntryDto(ArticleStatusChange change) => new()
        {
            FromStatus = change.FromStatus,
            ToStatus = change.ToStatus,
            ChangedAt = change.ChangedAt,
            ChangedByDisplayName = change.ChangedBy?.DisplayName,
            Comment = change.Comment,
        };

        /// <summary>The article as <paramref name="viewer"/> sees it: only the status moves they may make are listed.</summary>
        private ArticleReadDto ToReadDto(Article article, ArticleViewer viewer)
        {
            var dto = _mapper.Map<ArticleReadDto>(article);
            var coAuthorIds = article.CoAuthors.Select(coAuthor => coAuthor.UserId).ToList();
            dto.AllowedTransitions.RemoveAll(target =>
                !viewer.CanChangeStatus(article.Status, target, article.AuthorId, coAuthorIds));
            return dto;
        }

        /// <param name="authorId">The creating user, recorded as the article's author.</param>
        /// <exception cref="ValidationException">The title is empty or white space (article_title_required).</exception>
        public async Task<ArticleReadDto> CreateAsync(ArticleCreateDto createDto, int? authorId)
        {
            var article = _mapper.Map<Article>(createDto);
            article.Title = RequiredTitle(createDto.Title);
            ArticleTimestamps.StampCreated(article, authorId, _clock);
            article.Order = await _articleRepository.GetNextSiblingOrderAsync(article.ParentArticleId);
            article.Slug = await new ArticleSlugAssigner(_articleRepository).GenerateUniqueAsync(article.Title, article.Locale, articleId: null);
            await _articleRepository.AddAsync(article);
            await _articleRepository.SaveChangesAsync();

            return _mapper.Map<ArticleReadDto>(article);
        }

        /// <summary>
        /// Renames the article and, when the parent differs, moves it last under the new one (the
        /// tree's rename, A-03). The slug stays as it is; no revision is written.
        /// </summary>
        /// <exception cref="NotFoundException">The article does not exist.</exception>
        /// <exception cref="ValidationException">The title is empty, or the parent is unknown or inside the article's own subtree.</exception>
        public async Task UpdateAsync(int id, ArticleUpdateDto updateDto)
        {
            var title = RequiredTitle(updateDto.Title);
            var article = await _articleRepository.GetByIdAsync(id);
            if (article is null)
            {
                throw new NotFoundException(AppErrors.ArticleNotFound);
            }

            _mapper.Map(updateDto, article);
            article.Title = title;
            if (updateDto.ParentArticleId != article.ParentArticleId)
            {
                await PlaceAsync(article, updateDto.ParentArticleId, index: null);
            }

            article.UpdatedAt = _clock.GetUtcNow().UtcDateTime;
            await _articleRepository.UpdateAsync(article);
            await _articleRepository.SaveChangesAsync();
        }

        /// <summary>
        /// Moves the article under <paramref name="dto"/>'s parent at its index and renumbers the
        /// siblings it left and joined to 0..N-1, in one save. A move is structural: it writes no
        /// revision and leaves <see cref="Article.UpdatedAt"/> alone.
        /// </summary>
        /// <exception cref="NotFoundException">The article does not exist.</exception>
        /// <exception cref="ValidationException">The parent does not exist, or is the article or one of its descendants.</exception>
        public async Task<ArticleReadDto> MoveAsync(int id, ArticleMoveDto dto)
        {
            var article = await _articleRepository.GetByIdAsync(id)
                ?? throw new NotFoundException(AppErrors.ArticleNotFound);

            await PlaceAsync(article, dto.ParentArticleId, dto.Index);
            await _articleRepository.SaveChangesAsync();
            return _mapper.Map<ArticleReadDto>(article);
        }

        /// <summary>Validates the new parent, then stages the article's new position and both sibling renumberings.</summary>
        private async Task PlaceAsync(Article article, int? parentId, int? index)
        {
            if (parentId is int newParentId)
            {
                var parentIds = await _articleRepository.GetParentIdsAsync();
                if (!parentIds.ContainsKey(newParentId))
                {
                    throw new ValidationException(AppErrors.ArticleParentNotFound(newParentId));
                }

                if (ArticleTreeRules.IsSelfOrDescendant(parentIds, article.Id, newParentId))
                {
                    throw new ValidationException(AppErrors.ArticleMoveCycle);
                }
            }

            var oldParentId = article.ParentArticleId;
            var siblings = (await _articleRepository.GetSiblingsAsync(parentId))
                .Where(sibling => sibling.Id != article.Id)
                .ToList();
            siblings.Insert(Math.Clamp(index ?? siblings.Count, 0, siblings.Count), article);
            article.ParentArticleId = parentId;
            Renumber(siblings);

            if (oldParentId != parentId)
            {
                Renumber((await _articleRepository.GetSiblingsAsync(oldParentId))
                    .Where(sibling => sibling.Id != article.Id));
            }
        }

        private static string RequiredTitle(string? title) =>
            string.IsNullOrWhiteSpace(title)
                ? throw new ValidationException(AppErrors.ArticleTitleRequired)
                : title.Trim();

        private static void Renumber(IEnumerable<Article> siblings)
        {
            var order = 0;
            foreach (var sibling in siblings)
            {
                sibling.Order = order++;
            }
        }

        /// <summary>
        /// Deletes the article. If it was ever published, its current and old slugs are kept as
        /// tombstones, so their URLs answer 410 Gone rather than 404 (O-07, #58).
        /// </summary>
        /// <exception cref="NotFoundException">No such article.</exception>
        public async Task DeleteAsync(int id)
        {
            var article = await _articleRepository.GetByIdAsync(id);
            if (article is null)
            {
                throw new NotFoundException(AppErrors.ArticleNotFound);
            }

            if (article.PublishedAt is not null)
            {
                var redirects = await _articleRepository.GetSlugRedirectsAsync(article.Id);
                var slugs = redirects.Select(redirect => redirect.Slug)
                    .Append(article.Slug)
                    .Where(slug => !string.IsNullOrEmpty(slug))
                    .Distinct()
                    .ToList();
                await _articleRepository.AddDeletedSlugsAsync(article.Locale, slugs, _clock.GetUtcNow().UtcDateTime);
            }

            await _articleRepository.DeleteAsync(article);
            await _articleRepository.SaveChangesAsync();
        }
    }
}
