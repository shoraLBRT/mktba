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

        /// <summary>One article; one <paramref name="viewer"/> may not see counts as missing.</summary>
        public async Task<ArticleReadDto?> GetByIdAsync(int id, ArticleViewer viewer)
        {
            var article = await _articleRepository.GetByIdWithCoAuthorsAsync(id);
            return article is null || !viewer.CanSee(article)
                ? null
                : ToReadDto(article, viewer);
        }

        /// <summary>
        /// Moves the article to <paramref name="target"/> if <see cref="ArticleStatusTransitions"/> allows it.
        /// The first move to Published sets <see cref="Article.PublishedAt"/>; later ones keep it.
        /// Every move to Published records the latest revision in <see cref="Article.PublishedRevisionId"/>.
        /// A status change is not a content save and leaves <see cref="Article.UpdatedAt"/> alone.
        /// Whether the caller may make the move is checked by the API before (U-02, #30);
        /// <paramref name="viewer"/> only shapes the returned <see cref="ArticleReadDto.AllowedTransitions"/>.
        /// </summary>
        /// <exception cref="NotFoundException">The article does not exist.</exception>
        /// <exception cref="ValidationException">The transition is not allowed.</exception>
        public async Task<ArticleReadDto> ChangeStatusAsync(int id, ArticleStatus target, ArticleViewer viewer)
        {
            var article = await _articleRepository.GetByIdWithCoAuthorsAsync(id)
                ?? throw new NotFoundException(AppErrors.ArticleNotFound);

            if (!ArticleStatusTransitions.IsAllowed(article.Status, target))
            {
                throw new ValidationException(AppErrors.ArticleStatusTransitionInvalid(article.Status, target));
            }

            article.Status = target;
            if (target == ArticleStatus.Published)
            {
                article.PublishedAt ??= _clock.GetUtcNow().UtcDateTime;
                article.PublishedRevisionId = await _articleRepository.GetLatestRevisionIdAsync(id);
            }

            await _articleRepository.UpdateAsync(article);
            await _articleRepository.SaveChangesAsync();
            return ToReadDto(article, viewer);
        }

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
        public async Task<ArticleReadDto> CreateAsync(ArticleCreateDto createDto, int? authorId)
        {
            var article = _mapper.Map<Article>(createDto);
            ArticleTimestamps.StampCreated(article, authorId, _clock);
            article.Order = await _articleRepository.GetNextSiblingOrderAsync(article.ParentArticleId);
            article.Slug = await new ArticleSlugAssigner(_articleRepository).GenerateUniqueAsync(article.Title, article.Locale, articleId: null);
            await _articleRepository.AddAsync(article);
            await _articleRepository.SaveChangesAsync();

            return _mapper.Map<ArticleReadDto>(article);
        }

        public async Task UpdateAsync(int id, ArticleUpdateDto updateDto)
        {
            var article = await _articleRepository.GetByIdAsync(id);
            if (article is null)
            {
                throw new NotFoundException(AppErrors.ArticleNotFound);
            }

            _mapper.Map(updateDto, article);
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

        private static void Renumber(IEnumerable<Article> siblings)
        {
            var order = 0;
            foreach (var sibling in siblings)
            {
                sibling.Order = order++;
            }
        }

        public async Task DeleteAsync(int id)
        {
            var article = await _articleRepository.GetByIdAsync(id);
            if (article is null)
            {
                throw new NotFoundException(AppErrors.ArticleNotFound);
            }

            await _articleRepository.DeleteAsync(article);
            await _articleRepository.SaveChangesAsync();
        }
    }
}
