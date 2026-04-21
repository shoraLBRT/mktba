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

    public async Task<List<SchoolDto>> GetByArticleIdAsync(int articleId, CancellationToken cancellationToken = default)
    {
        var schools = await _schoolRepo.GetByArticleIdAsync(articleId, cancellationToken);
        return schools.Select(ToDto).ToList();
    }

    public async Task<SchoolDto> CreateCustomSchoolAsync(SchoolCreateDto dto, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Slug))
            throw new ValidationException("Slug is required.");

        if (string.IsNullOrWhiteSpace(dto.Name))
            throw new ValidationException("Name is required.");

        if (string.IsNullOrWhiteSpace(dto.ShortName))
            throw new ValidationException("ShortName is required.");

        if (await _articleRepo.GetByIdAsync(dto.ArticleScopeId) is null)
            throw new NotFoundException($"Article with id {dto.ArticleScopeId} not found.");

        var slug = dto.Slug.Trim().ToLowerInvariant();
        if (await _schoolRepo.SlugExistsAsync(slug, cancellationToken))
            throw new ValidationException($"School with slug '{slug}' already exists.");

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
            throw new NotFoundException("School not found.");

        if (school.IsSystem)
            throw new ValidationException("System schools cannot be deleted.");

        await _schoolRepo.DeleteAsync(school);
        await _schoolRepo.SaveChangesAsync();
    }

    private static SchoolDto ToDto(School s) =>
        new(s.Id, s.Slug, s.Name, s.ShortName, s.IsSystem, s.ArticleScopeId);
}
