using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs
{
    /// <summary>An entry of the directory of sources (M-07, #71).</summary>
    /// <param name="Kind">Book, HadithCollection, Quran or Other.</param>
    /// <param name="Title">Title of the work.</param>
    /// <param name="Author">Author or compiler; null when there is none to name.</param>
    /// <param name="Details">Free-form publication details (publisher, year, edition), or null.</param>
    /// <param name="Url">Absolute http(s) link to the work, or null.</param>
    public record SourceDto(
        int Id,
        SourceKind Kind,
        string Title,
        string? Author,
        string? Details,
        string? Url
    );

    /// <summary>Create or replace a directory entry. Blank optional strings are stored as null.</summary>
    /// <param name="Kind">Book, HadithCollection, Quran or Other (source_kind_invalid).</param>
    /// <param name="Title">Required (source_title_required), at most 300 characters.</param>
    /// <param name="Author">At most 200 characters.</param>
    /// <param name="Details">At most 500 characters.</param>
    /// <param name="Url">An absolute http or https URL, at most 2048 characters (source_url_invalid).</param>
    public record SourceWriteDto(
        SourceKind Kind,
        string Title,
        string? Author,
        string? Details,
        string? Url
    );

    /// <summary>
    /// One citation of an opinion. The position in the list is the order of the citations. The same
    /// source may be cited more than once with different locators.
    /// </summary>
    /// <param name="SourceId">A directory entry (<c>/sources</c>); an unknown id fails with source_not_found.</param>
    /// <param name="Locator">
    /// Place inside the source — a page, a hadith number, sura:ayah — or null for the work as a whole;
    /// at most 200 characters (source_locator_too_long).
    /// </param>
    public record OpinionSourceDto(int SourceId, string? Locator = null);
}
