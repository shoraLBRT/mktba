using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services
{
    /// <summary>The list of articles on an author's public page (P-01, #89).</summary>
    public class AuthorArticlesService
    {
        public const int DefaultPageSize = 20;
        public const int MaxPageSize = 50;

        private readonly ArticleRepository _articles;
        private readonly UserRepository _users;

        public AuthorArticlesService(ArticleRepository articles, UserRepository users)
        {
            _articles = articles;
            _users = users;
        }

        /// <summary>
        /// The articles of one language the author at <paramref name="slug"/> wrote or co-authored, as
        /// an anonymous reader reaches them: Published, every ancestor Published, no empty stubs —
        /// the rule of <see cref="RecentArticlesService"/>. Ordered by first publication, newest
        /// first. The list can be empty: a profile is public by any Published article, the list holds
        /// only those a reader can open.
        /// </summary>
        /// <param name="slug">The author's profile slug.</param>
        /// <param name="requestedLocale">Language of the list; null or blank means <see cref="Locales.Default"/>.</param>
        /// <param name="page">Page from 1; anything lower is read as 1.</param>
        /// <param name="pageSize">Entries per page; kept within 1 to <see cref="MaxPageSize"/>.</param>
        /// <exception cref="ValidationException">locale_unsupported.</exception>
        /// <exception cref="NotFoundException">author_not_found: no public profile at the slug.</exception>
        public async Task<AuthorArticlesDto> GetAsync(
            string slug, string? requestedLocale, int page, int pageSize, CancellationToken cancellationToken = default)
        {
            var locale = Locales.Normalize(requestedLocale)
                ?? throw new ValidationException(AppErrors.LocaleUnsupported(requestedLocale!));
            var user = await _users.FindPublicBySlugAsync(slug, cancellationToken)
                ?? throw new NotFoundException(AppErrors.AuthorNotFound);
            var currentPage = Math.Max(page, 1);
            var size = Math.Clamp(pageSize, 1, MaxPageSize);

            var credited = await _articles.GetPublishedIdsCreditedToAsync(user.Id, cancellationToken);
            var rows = await _articles.GetRecentRowsAsync(cancellationToken);
            var isReachable = ArticleReachability.Among(rows);
            var verified = await _articles.GetVerifiedIdsAsync(cancellationToken);

            var listed = rows
                .Where(row => credited.Contains(row.Id) && row.HasContent && row.PublishedAt is not null
                    && row.Locale == locale && isReachable(row))
                .OrderByDescending(row => row.PublishedAt)
                .ThenByDescending(row => row.Id)
                .ToList();

            return new AuthorArticlesDto(
                listed.Count,
                currentPage,
                size,
                listed
                    .Skip((int)Math.Min((long)(currentPage - 1) * size, int.MaxValue))
                    .Take(size)
                    .Select(row => new AuthorArticleDto(row.Id, row.Title, row.Slug, row.Summary, row.PublishedAt!.Value, row.UpdatedAt, verified.Contains(row.Id)))
                    .ToList());
        }
    }
}
