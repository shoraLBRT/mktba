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

    public async Task<List<SchoolDto>> GetSystemSchoolsAsync(CancellationToken cancellationToken = default)
    {
        var schools = await _schoolRepo.GetSystemSchoolsAsync(cancellationToken);
        return schools.Select(ToDto).ToList();
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
}
