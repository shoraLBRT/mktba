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
    /// The scholar opinions of one article (M-08, #116): those created for it and those its opinions
    /// use. An article <paramref name="viewer"/> may not see
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

    /// <summary>The directory of scholar opinions an author picks from (M-08, #116), by name.</summary>
    public async Task<List<SchoolDto>> GetCustomSchoolsAsync(CancellationToken cancellationToken = default)
    {
        var schools = await _schoolRepo.GetCustomSchoolsAsync(cancellationToken);
        return schools.Select(ToDto).ToList();
    }

    /// <summary>Creates a scholar opinion; the caller's right to the scope article is checked by the endpoint.</summary>
    /// <exception cref="ValidationException">A required field is blank, a field is too long, the slug is taken, or the scholar's article does not exist.</exception>
    /// <exception cref="NotFoundException"><c>article_not_found</c>: the scope article does not exist.</exception>
    public async Task<SchoolDto> CreateCustomSchoolAsync(SchoolCreateDto dto, CancellationToken cancellationToken = default)
    {
        var fields = CheckFields(dto.Name, dto.ShortName, dto.ScholarName, dto.ScholarYears, dto.Description);

        if (dto.ArticleScopeId is int scopeId && await _articleRepo.GetByIdAsync(scopeId) is null)
            throw new NotFoundException(AppErrors.ArticleNotFound);

        var slug = string.IsNullOrWhiteSpace(dto.Slug)
            ? $"scholar-{Guid.NewGuid():N}"
            : dto.Slug.Trim().ToLowerInvariant();
        if (slug.Length > School.SlugMaxLength)
            throw new ValidationException(AppErrors.SchoolFieldTooLong("slug", School.SlugMaxLength));
        if (await _schoolRepo.SlugExistsAsync(slug, cancellationToken))
            throw new ValidationException(AppErrors.SchoolSlugTaken(slug));

        var school = new School
        {
            Slug = slug,
            IsSystem = false,
            ArticleScopeId = dto.ArticleScopeId,
        };
        await ApplyAsync(school, fields, dto.ScholarArticleId);

        await _schoolRepo.AddAsync(school);
        await _schoolRepo.SaveChangesAsync();

        return ToDto(school);
    }

    /// <summary>
    /// Replaces the fields of a scholar opinion; who may do it is checked by the endpoint. The change
    /// shows in every article that uses the entry.
    /// </summary>
    /// <exception cref="NotFoundException"><c>school_not_found</c>.</exception>
    /// <exception cref="ValidationException">A system school, a blank required field, a field too long, or no such scholar's article.</exception>
    public async Task<SchoolDto> UpdateCustomSchoolAsync(int id, SchoolUpdateDto dto, CancellationToken cancellationToken = default)
    {
        var school = await _schoolRepo.GetWithScholarArticleAsync(id, cancellationToken)
            ?? throw new NotFoundException(AppErrors.SchoolNotFound);
        if (school.IsSystem)
            throw new ValidationException(AppErrors.SystemSchoolUpdateForbidden);

        var fields = CheckFields(dto.Name, dto.ShortName, dto.ScholarName, dto.ScholarYears, dto.Description);
        await ApplyAsync(school, fields, dto.ScholarArticleId);
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

    private sealed record SchoolFields(string Name, string ShortName, string? ScholarName, string? ScholarYears, string? Description);

    /// <summary>Trims the fields, blanks of the optional ones to null, and checks the required ones and the lengths.</summary>
    private static SchoolFields CheckFields(string? name, string? shortName, string? scholarName, string? scholarYears, string? description)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ValidationException(AppErrors.SchoolNameRequired);
        if (string.IsNullOrWhiteSpace(shortName))
            throw new ValidationException(AppErrors.SchoolShortNameRequired);

        var fields = new SchoolFields(
            name.Trim(), shortName.Trim(), OrNull(scholarName), OrNull(scholarYears), OrNull(description));

        CheckLength(fields.Name, "name", School.NameMaxLength);
        CheckLength(fields.ShortName, "shortName", School.ShortNameMaxLength);
        CheckLength(fields.ScholarName, "scholarName", School.ScholarNameMaxLength);
        CheckLength(fields.ScholarYears, "scholarYears", School.ScholarYearsMaxLength);
        CheckLength(fields.Description, "description", School.DescriptionMaxLength);
        return fields;
    }

    private static string? OrNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static void CheckLength(string? value, string field, int maxLength)
    {
        if (value is not null && value.Length > maxLength)
            throw new ValidationException(AppErrors.SchoolFieldTooLong(field, maxLength));
    }

    private async Task ApplyAsync(School school, SchoolFields fields, int? scholarArticleId)
    {
        school.Name = fields.Name;
        school.ShortName = fields.ShortName;
        school.ScholarName = fields.ScholarName;
        school.ScholarYears = fields.ScholarYears;
        school.Description = fields.Description;

        // The link kept as it is needs no check: its article may be in the trash, and comes back with it.
        if (scholarArticleId == school.ScholarArticleId && school.Id != 0)
            return;

        Article? scholarArticle = null;
        if (scholarArticleId is int articleId)
        {
            scholarArticle = await _articleRepo.GetByIdAsync(articleId)
                ?? throw new ValidationException(AppErrors.SchoolScholarArticleNotFound);
        }

        school.ScholarArticleId = scholarArticle?.Id;
        school.ScholarArticle = scholarArticle;
    }

    private static SchoolDto ToDto(School s) =>
        new(s.Id, s.Slug, s.Name, s.ShortName, s.IsSystem, s.ArticleScopeId,
            s.ScholarName, s.ScholarYears, s.Description, s.ScholarArticleId, ToLink(s.ScholarArticle));

    /// <summary>The link readers get: only to a Published article (a trashed one is never loaded).</summary>
    private static SchoolScholarArticleDto? ToLink(Article? article) =>
        article is { Status: ArticleStatus.Published }
            ? new SchoolScholarArticleDto(article.Id, article.Slug, article.Title, article.Locale)
            : null;

    /// <summary>A school named in <paramref name="locale"/>, or in Russian when it has no such translation.</summary>
    private static SchoolDto ToDto(School s, string locale)
    {
        var translation = s.Translations.FirstOrDefault(t => t.Locale == locale);
        return translation is null
            ? ToDto(s)
            : ToDto(s) with { Name = translation.Name, ShortName = translation.ShortName };
    }
}
