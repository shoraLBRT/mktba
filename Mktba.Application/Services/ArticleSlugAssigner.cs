using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services;

/// <summary>
/// Chooses article slugs against the database and moves an article to a new slug,
/// keeping the old one as a redirect.
/// </summary>
public sealed class ArticleSlugAssigner
{
    private readonly ArticleRepository _articleRepository;

    public ArticleSlugAssigner(ArticleRepository articleRepository)
    {
        _articleRepository = articleRepository;
    }

    /// <summary>
    /// The slug an editor asked for, validated and checked for uniqueness — or, when they left it
    /// blank, one generated from the title.
    /// </summary>
    /// <param name="locale">The article's locale; slugs are unique within it.</param>
    /// <param name="articleId">The article being edited; <c>null</c> for a new one.</param>
    /// <exception cref="ValidationException"><c>article_slug_invalid</c> or <c>article_slug_taken</c>.</exception>
    public async Task<string> ChooseAsync(string? requestedSlug, string title, string locale, int? articleId)
    {
        if (string.IsNullOrWhiteSpace(requestedSlug))
        {
            return await GenerateUniqueAsync(title, locale, articleId);
        }

        var slug = requestedSlug.Trim().ToLowerInvariant();
        if (!ArticleSlugRules.IsValid(slug))
        {
            throw new ValidationException(AppErrors.ArticleSlugInvalid);
        }

        if (await _articleRepository.IsSlugTakenAsync(locale, slug, articleId))
        {
            throw new ValidationException(AppErrors.ArticleSlugTaken(slug));
        }

        return slug;
    }

    /// <summary>The slug from the title, or the first free one of slug-2, slug-3, … in <paramref name="locale"/>.</summary>
    public async Task<string> GenerateUniqueAsync(string title, string locale, int? articleId)
    {
        var baseSlug = ArticleSlugRules.FromTitle(title);
        for (var number = 1; ; number++)
        {
            var candidate = ArticleSlugRules.WithSuffix(baseSlug, number);
            if (!await _articleRepository.IsSlugTakenAsync(locale, candidate, articleId))
            {
                return candidate;
            }
        }
    }

    /// <summary>
    /// Gives a saved article a new slug. The old slug becomes a redirect; if the new slug was one
    /// of this article's redirects, that redirect is removed. Changes are saved by the caller.
    /// </summary>
    public async Task ChangeAsync(Article article, string newSlug)
    {
        if (article.Slug == newSlug)
        {
            return;
        }

        var redirects = await _articleRepository.GetSlugRedirectsAsync(article.Id);
        var reused = redirects.FirstOrDefault(redirect => redirect.Slug == newSlug);
        if (reused is not null)
        {
            _articleRepository.RemoveSlugRedirect(reused);
        }

        if (!string.IsNullOrEmpty(article.Slug))
        {
            _articleRepository.AddSlugRedirect(new ArticleSlugRedirect { Slug = article.Slug, Locale = article.Locale, ArticleId = article.Id });
        }

        article.Slug = newSlug;
    }
}
