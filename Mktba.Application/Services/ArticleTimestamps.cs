using Mktba.Domain.Entities;

namespace Mktba.Application.Services
{
    /// <summary>Sets the creation fields of a new article the same way for every create path.</summary>
    internal static class ArticleTimestamps
    {
        public static void StampCreated(Article article, int? authorId, TimeProvider clock)
        {
            var now = clock.GetUtcNow().UtcDateTime;
            article.CreatedAt = now;
            article.UpdatedAt = now;
            article.AuthorId = authorId;
        }
    }
}
