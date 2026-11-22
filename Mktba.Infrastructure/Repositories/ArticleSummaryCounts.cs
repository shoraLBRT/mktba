using Mktba.Domain.Entities;

namespace Mktba.Infrastructure.Repositories
{
    /// <summary>
    /// Article counts for the admin dashboard (A-07, #95), counted in SQL: the number of articles
    /// in each status (a status with none is missing) and how many of them have content.
    /// </summary>
    public sealed record ArticleSummaryCounts(IReadOnlyDictionary<ArticleStatus, int> CountByStatus, int WithContent);
}
