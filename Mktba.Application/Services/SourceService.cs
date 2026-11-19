using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services;

/// <summary>
/// The shared directory of sources (M-07, #71). Entries are not versioned: revisions keep their own
/// copy of every cited source (<see cref="ArticleSnapshotSourceDto"/>), so editing an entry changes
/// the articles that cite it now and leaves history as it was.
/// </summary>
public class SourceService
{
    public const int DefaultLimit = 20;
    public const int MaxLimit = 50;

    private readonly SourceRepository _sources;

    public SourceService(SourceRepository sources)
    {
        _sources = sources;
    }

    /// <summary>Entries whose title or author contains <paramref name="query"/>, by title.</summary>
    /// <param name="query">Null or blank lists the directory from the start.</param>
    /// <param name="kind">Only entries of this kind; null means any.</param>
    /// <param name="limit">Kept within 1 to <see cref="MaxLimit"/>.</param>
    public async Task<List<SourceDto>> SearchAsync(string? query, SourceKind? kind, int limit, CancellationToken cancellationToken = default)
    {
        var text = string.IsNullOrWhiteSpace(query) ? null : query.Trim();
        var found = await _sources.SearchAsync(text, kind, Math.Clamp(limit, 1, MaxLimit), cancellationToken);
        return found.Select(ToDto).ToList();
    }

    /// <exception cref="ValidationException">A field is invalid, or the entry already exists (source_duplicate).</exception>
    public async Task<SourceDto> CreateAsync(SourceWriteDto dto, CancellationToken cancellationToken = default)
    {
        var source = new Source();
        await ApplyAsync(source, dto, cancellationToken);
        await _sources.AddAsync(source);
        await _sources.SaveChangesAsync();
        return ToDto(source);
    }

    /// <exception cref="NotFoundException">No such entry.</exception>
    /// <exception cref="ValidationException">A field is invalid, or another entry is the same (source_duplicate).</exception>
    public async Task<SourceDto> UpdateAsync(int id, SourceWriteDto dto, CancellationToken cancellationToken = default)
    {
        var source = await _sources.GetByIdAsync(id) ?? throw new NotFoundException(AppErrors.SourceNotFound(id));
        await ApplyAsync(source, dto, cancellationToken);
        await _sources.SaveChangesAsync();
        return ToDto(source);
    }

    /// <summary>Deletes an entry nothing cites. A cited one is refused: remove the citations first.</summary>
    /// <exception cref="NotFoundException">No such entry.</exception>
    /// <exception cref="ValidationException">source_in_use.</exception>
    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var source = await _sources.GetByIdAsync(id) ?? throw new NotFoundException(AppErrors.SourceNotFound(id));
        var citations = await _sources.CountCitationsAsync(id, cancellationToken);
        if (citations > 0)
        {
            throw new ValidationException(AppErrors.SourceInUse(citations));
        }

        await _sources.DeleteAsync(source);
        await _sources.SaveChangesAsync();
    }

    internal static SourceDto ToDto(Source source)
        => new(source.Id, source.Kind, source.Title, source.Author, source.Details, source.Url);

    private async Task ApplyAsync(Source source, SourceWriteDto dto, CancellationToken cancellationToken)
    {
        if (!Enum.IsDefined(dto.Kind))
        {
            throw new ValidationException(AppErrors.SourceKindInvalid);
        }

        var title = Trimmed(dto.Title) ?? throw new ValidationException(AppErrors.SourceTitleRequired);
        var author = Trimmed(dto.Author);
        var details = Trimmed(dto.Details);
        var url = Trimmed(dto.Url);

        CheckLength("title", title, MktbaDbContext.SourceTitleMaxLength);
        CheckLength("author", author, MktbaDbContext.SourceAuthorMaxLength);
        CheckLength("details", details, MktbaDbContext.SourceDetailsMaxLength);
        if (url is not null && !IsValidUrl(url))
        {
            throw new ValidationException(AppErrors.SourceUrlInvalid);
        }

        var duplicate = await _sources.FindDuplicateAsync(dto.Kind, title, author, source.Id == 0 ? null : source.Id, cancellationToken);
        if (duplicate is not null)
        {
            throw new ValidationException(AppErrors.SourceDuplicate(duplicate.Id));
        }

        source.Kind = dto.Kind;
        source.Title = title;
        source.Author = author;
        source.Details = details;
        source.Url = url;
    }

    private static void CheckLength(string field, string? value, int maxLength)
    {
        if (value is not null && value.Length > maxLength)
        {
            throw new ValidationException(AppErrors.SourceFieldTooLong(field, maxLength));
        }
    }

    private static bool IsValidUrl(string url)
        => url.Length <= MktbaDbContext.SourceUrlMaxLength
           && !url.Any(char.IsWhiteSpace)
           && Uri.TryCreate(url, UriKind.Absolute, out var uri)
           && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);

    private static string? Trimmed(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
