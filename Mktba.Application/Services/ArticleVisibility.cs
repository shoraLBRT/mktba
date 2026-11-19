using Mktba.Domain.Entities;

namespace Mktba.Application.Services
{
    /// <summary>Who may read an article: editors see every status, anonymous readers only Published.</summary>
    public static class ArticleVisibility
    {
        public static bool IsVisible(ArticleStatus status, bool includeUnpublished)
            => includeUnpublished || status == ArticleStatus.Published;
    }
}
