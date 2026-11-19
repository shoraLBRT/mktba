using Mktba.Domain.Entities;

namespace Mktba.Infrastructure.Repositories
{
    /// <summary>The SQL side of <see cref="ArticleViewer.CanSee(Article)"/>, so lists are filtered in the database.</summary>
    public static class ArticleQueries
    {
        /// <summary>The articles <paramref name="viewer"/> may read: Published ones plus every status of those they may edit.</summary>
        public static IQueryable<Article> VisibleTo(this IQueryable<Article> articles, ArticleViewer viewer)
        {
            if (viewer.EditsAnyArticle)
            {
                return articles;
            }

            var userId = viewer.UserId;
            return userId is null
                ? articles.Where(article => article.Status == ArticleStatus.Published)
                : articles.Where(article => article.Status == ArticleStatus.Published
                    || article.AuthorId == userId
                    || article.CoAuthors.Any(coAuthor => coAuthor.UserId == userId));
        }
    }
}
