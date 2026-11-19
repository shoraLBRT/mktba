namespace Mktba.Infrastructure.Repositories
{
    /// <summary>
    /// A user credited on an article, as readers may see them: the name and the profile slug only.
    /// </summary>
    /// <param name="HasPublicPage">
    /// Whether the user's author page answers now: they are credited on at least one Published article.
    /// </param>
    public sealed record ArticleCreditRow(string DisplayName, string Slug, bool HasPublicPage);
}
