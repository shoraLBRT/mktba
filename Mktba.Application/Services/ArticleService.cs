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

        public ArticleService(ArticleRepository articleRepository, IMapper mapper)
        {
            _articleRepository = articleRepository;
            _mapper = mapper;
        }

        /// <summary>All articles; without <paramref name="includeUnpublished"/> only Published ones.</summary>
        public async Task<IEnumerable<ArticleReadDto>> GetAllAsync(bool includeUnpublished)
        {
            var articles = await _articleRepository.GetAllWithParagraphsAsync(publishedOnly: !includeUnpublished);
            return _mapper.Map<IEnumerable<ArticleReadDto>>(articles);
        }

        /// <summary>One article; a non-Published one counts as missing without <paramref name="includeUnpublished"/>.</summary>
        public async Task<ArticleReadDto?> GetByIdAsync(int id, bool includeUnpublished)
        {
            var article = await _articleRepository.GetByIdAsync(id);
            return article is null || !ArticleVisibility.IsVisible(article.Status, includeUnpublished)
                ? null
                : _mapper.Map<ArticleReadDto>(article);
        }

        /// <summary>
        /// Moves the article to <paramref name="target"/> if <see cref="ArticleStatusTransitions"/> allows it.
        /// </summary>
        /// <exception cref="NotFoundException">The article does not exist.</exception>
        /// <exception cref="ValidationException">The transition is not allowed.</exception>
        public async Task<ArticleReadDto> ChangeStatusAsync(int id, ArticleStatus target)
        {
            var article = await _articleRepository.GetByIdAsync(id)
                ?? throw new NotFoundException(AppErrors.ArticleNotFound);

            if (!ArticleStatusTransitions.IsAllowed(article.Status, target))
            {
                throw new ValidationException(AppErrors.ArticleStatusTransitionInvalid(article.Status, target));
            }

            article.Status = target;
            await _articleRepository.UpdateAsync(article);
            await _articleRepository.SaveChangesAsync();
            return _mapper.Map<ArticleReadDto>(article);
        }

        public async Task<ArticleReadDto> CreateAsync(ArticleCreateDto createDto)
        {
            var article = _mapper.Map<Article>(createDto);
            article.Slug = await new ArticleSlugAssigner(_articleRepository).GenerateUniqueAsync(article.Title, articleId: null);
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
            await _articleRepository.UpdateAsync(article);
            await _articleRepository.SaveChangesAsync();
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
