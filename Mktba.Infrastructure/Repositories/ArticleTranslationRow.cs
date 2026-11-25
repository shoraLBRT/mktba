using Mktba.Domain.Entities;

namespace Mktba.Infrastructure.Repositories
{
    /// <summary>
    /// One language version of a text (I-06, #110): what the content read needs to list an article's
    /// translations and to tell whether a translation is outdated.
    /// </summary>
    /// <param name="NoIndex">The article asks search engines not to index it: hreflang leaves it out (O-08, #104).</param>
    /// <param name="LatestRevision">The article's highest revision number, 0 if it has none.</param>
    public sealed record ArticleTranslationRow(
        int Id,
        string Locale,
        string Slug,
        string Title,
        ArticleStatus Status,
        int? AuthorId,
        IReadOnlyList<int> CoAuthorIds,
        int LatestRevision,
        bool NoIndex);
}
