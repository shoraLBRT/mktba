using Mktba.Domain.Entities;

namespace Mktba.Application.Tests;

/// <summary>Viewers the service tests read and change articles as.</summary>
internal static class TestViewers
{
    /// <summary>Sees and may do everything, like an admin.</summary>
    public static ArticleViewer Admin { get; } = new(UserId: null, EditsAnyArticle: true, ReviewsArticles: true);

    /// <summary>An author with id <paramref name="userId"/>: Published articles plus their own.</summary>
    public static ArticleViewer Author(int userId) => new(userId, EditsAnyArticle: false, ReviewsArticles: false);
}
