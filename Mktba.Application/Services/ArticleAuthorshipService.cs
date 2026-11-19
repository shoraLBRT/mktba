using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services
{
    /// <summary>Reads and changes who is credited for an article: its author and co-authors.</summary>
    public class ArticleAuthorshipService
    {
        private readonly ArticleRepository _articles;
        private readonly UserRepository _users;
        private readonly TimeProvider _clock;

        public ArticleAuthorshipService(ArticleRepository articles, UserRepository users, TimeProvider clock)
        {
            _articles = articles;
            _users = users;
            _clock = clock;
        }

        /// <exception cref="NotFoundException">The article does not exist.</exception>
        public async Task<ArticleAuthorsDto> GetAsync(int articleId)
        {
            var article = await _articles.GetByIdWithCoAuthorsAsync(articleId)
                ?? throw new NotFoundException(AppErrors.ArticleNotFound);
            return ToDto(article);
        }

        /// <summary>
        /// Replaces the author and the co-author list. Counts as a metadata save, so it moves
        /// <see cref="Article.UpdatedAt"/>.
        /// </summary>
        /// <exception cref="NotFoundException">The article does not exist.</exception>
        /// <exception cref="ValidationException">A user does not exist, or the author is listed as co-author.</exception>
        public async Task<ArticleAuthorsDto> SetAsync(int articleId, ArticleAuthorsDto dto)
        {
            var article = await _articles.GetByIdWithCoAuthorsAsync(articleId)
                ?? throw new NotFoundException(AppErrors.ArticleNotFound);

            var coAuthorIds = dto.CoAuthorIds.Distinct().ToList();
            if (dto.AuthorId is int authorId && coAuthorIds.Contains(authorId))
            {
                throw new ValidationException(AppErrors.ArticleCoAuthorIsAuthor);
            }

            var requested = coAuthorIds.Concat(dto.AuthorId is int id ? new[] { id } : Array.Empty<int>()).ToList();
            var existing = (await _users.FindExistingIdsAsync(requested)).ToHashSet();
            var missing = requested.FirstOrDefault(userId => !existing.Contains(userId), -1);
            if (missing != -1)
            {
                throw new ValidationException(AppErrors.UserNotFound(missing));
            }

            article.AuthorId = dto.AuthorId;
            var keep = coAuthorIds.ToHashSet();
            foreach (var removed in article.CoAuthors.Where(c => !keep.Contains(c.UserId)).ToList())
            {
                article.CoAuthors.Remove(removed);
            }

            var current = article.CoAuthors.Select(c => c.UserId).ToHashSet();
            foreach (var userId in coAuthorIds.Where(userId => !current.Contains(userId)))
            {
                article.CoAuthors.Add(new ArticleCoAuthor { ArticleId = article.Id, UserId = userId });
            }

            article.UpdatedAt = _clock.GetUtcNow().UtcDateTime;
            await _articles.SaveChangesAsync();
            return ToDto(article);
        }

        /// <summary>Every user, for choosing authors in the admin editor.</summary>
        public async Task<List<UserSummaryDto>> ListUsersAsync()
            => (await _users.ListOrderedByEmailAsync())
                .Select(user => new UserSummaryDto { Id = user.Id, Email = user.Email })
                .ToList();

        private static ArticleAuthorsDto ToDto(Article article) => new()
        {
            AuthorId = article.AuthorId,
            CoAuthorIds = article.CoAuthors.Select(c => c.UserId).OrderBy(userId => userId).ToList(),
        };
    }
}
