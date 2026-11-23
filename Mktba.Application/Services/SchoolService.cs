using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services;

public class SchoolService
{
    private readonly SchoolRepository _schoolRepo;
    private readonly ArticleRepository _articleRepo;

    public SchoolService(SchoolRepository schoolRepo, ArticleRepository articleRepo)
    {
        _schoolRepo = schoolRepo;
        _articleRepo = articleRepo;
    }

    /// <summary>
    /// The canonical schools named in <paramref name="requestedLocale"/> (I-07, #111): the
    /// <see cref="SchoolTranslation"/> for that language, or the Russian name when the school has none.
    /// </summary>
    /// <param name="requestedLocale">Language of the names; null or blank means <see cref="Locales.Default"/>.</param>
    /// <exception cref="ValidationException">locale_unsupported.</exception>
    public async Task<List<SchoolDto>> GetSystemSchoolsAsync(string? requestedLocale = null, CancellationToken cancellationToken = default)
    {
        var locale = Locales.Normalize(requestedLocale)
            ?? throw new ValidationException(AppErrors.LocaleUnsupported(requestedLocale!));
        var schools = await _schoolRepo.GetSystemSchoolsAsync(locale, cancellationToken);
        return schools.Select(s => ToDto(s, locale)).ToList();
    }

    /// <summary>
    /// The custom schools of one article. An article <paramref name="viewer"/> may not see
    /// (<see cref="ArticleViewer.CanSee(ArticleStatus, int?, IEnumerable{int})"/>) counts as missing,
    /// as on the other article reads, so the schools of drafts do not leak through ids (#194).
    /// </summary>
    /// <exception cref="NotFoundException"><c>article_not_found</c>: no such article, or it is not visible.</exception>
    public async Task<List<SchoolDto>> GetByArticleIdAsync(int articleId, ArticleViewer viewer, CancellationToken cancellationToken = default)
    {
        var article = await _articleRepo.GetAccessRowAsync(articleId, cancellationToken);
        if (article is null || !viewer.CanSee(article.Status, article.AuthorId, article.CoAuthorIds))
            throw new NotFoundException(AppErrors.ArticleNotFound);

        var schools = await _schoolRepo.GetByArticleIdAsync(articleId, cancellationToken);
        return schools.Select(ToDto).ToList();
    }

    public async Task<SchoolDto> CreateCustomSchoolAsync(SchoolCreateDto dto, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Slug))
            throw new ValidationException(AppErrors.SchoolSlugRequired);

        if (string.IsNullOrWhiteSpace(dto.Name))
            throw new ValidationException(AppErrors.SchoolNameRequired);

        if (string.IsNullOrWhiteSpace(dto.ShortName))
            throw new ValidationException(AppErrors.SchoolShortNameRequired);

        if (await _articleRepo.GetByIdAsync(dto.ArticleScopeId) is null)
            throw new NotFoundException(AppErrors.ArticleNotFound);

        var slug = dto.Slug.Trim().ToLowerInvariant();
        if (await _schoolRepo.SlugExistsAsync(slug, cancellationToken))
            throw new ValidationException(AppErrors.SchoolSlugTaken(slug));

        var school = new School
        {
            Slug = slug,
            Name = dto.Name.Trim(),
            ShortName = dto.ShortName.Trim(),
            IsSystem = false,
            ArticleScopeId = dto.ArticleScopeId,
        };

        await _schoolRepo.AddAsync(school);
        await _schoolRepo.SaveChangesAsync();

        return ToDto(school);
    }

    public async Task DeleteCustomSchoolAsync(int id, CancellationToken cancellationToken = default)
    {
        var school = await _schoolRepo.GetByIdAsync(id);
        if (school is null)
            throw new NotFoundException(AppErrors.SchoolNotFound);

        if (school.IsSystem)
            throw new ValidationException(AppErrors.SystemSchoolDeleteForbidden);

        await _schoolRepo.DeleteAsync(school);
        await _schoolRepo.SaveChangesAsync();
    }

    private static SchoolDto ToDto(School s) =>
        new(s.Id, s.Slug, s.Name, s.ShortName, s.IsSystem, s.ArticleScopeId);

    /// <summary>A school named in <paramref name="locale"/>, or in Russian when it has no such translation.</summary>
    private static SchoolDto ToDto(School s, string locale)
    {
        var translation = s.Translations.FirstOrDefault(t => t.Locale == locale);
        return translation is null
            ? ToDto(s)
            : new(s.Id, s.Slug, translation.Name, translation.ShortName, s.IsSystem, s.ArticleScopeId);
    }
}
