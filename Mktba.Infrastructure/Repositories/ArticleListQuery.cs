using Mktba.Domain.Entities;

namespace Mktba.Infrastructure.Repositories
{
    /// <summary>The column the admin article list (A-02, #34) is sorted by; ties are broken by id.</summary>
    public enum ArticleListSort
    {
        UpdatedAt,
        CreatedAt,
        /// <summary>First publication; never-published articles come last in either direction.</summary>
        PublishedAt,
        Title,
        /// <summary>Workflow order: Draft, InReview, Published, Archived.</summary>
        Status,
    }

    public enum SortDirection
    {
        Asc,
        Desc,
    }

    /// <summary>
    /// One page of the admin article list. Filters left null do not filter; <paramref name="Page"/> is
    /// 1-based and both paging values are already within bounds.
    /// </summary>
    /// <param name="Search">Case-insensitive substring of the title or the slug.</param>
    /// <param name="Tag">The comparison key of one tag (<c>Tag.NormalizedName</c>): articles carrying that tag.</param>
    /// <param name="Mine">Only the articles the viewer writes or co-writes (the author's cabinet, P-02 #90).</param>
    public sealed record ArticleListQuery(
        string? Search,
        ArticleStatus? Status,
        int? AuthorId,
        string? Tag,
        string? Locale,
        ArticleListSort Sort,
        SortDirection Direction,
        int Page,
        int PageSize,
        bool Mine = false);

    /// <summary>An article as the admin list shows it, projected in SQL without its content rows.</summary>
    /// <param name="Tags">The tag names in order.</param>
    /// <param name="ParagraphCount">Counted in SQL; the paragraphs themselves are not loaded.</param>
    public sealed record ArticleListRow(
        int Id,
        string Title,
        string Slug,
        string Locale,
        ArticleStatus Status,
        int? ParentArticleId,
        int? AuthorId,
        IReadOnlyList<int> CoAuthorIds,
        IReadOnlyList<string> Tags,
        int ParagraphCount,
        DateTime CreatedAt,
        DateTime UpdatedAt,
        DateTime? PublishedAt);
}
