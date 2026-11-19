using Mktba.Domain.Entities;

namespace Mktba.Infrastructure.Repositories
{
    /// <summary>What a per-article permission check needs to know about one article: its status and owners.</summary>
    public sealed record ArticleAccessRow(int Id, ArticleStatus Status, int? AuthorId, IReadOnlyList<int> CoAuthorIds);
}
