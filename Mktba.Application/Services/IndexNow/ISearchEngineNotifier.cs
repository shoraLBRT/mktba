namespace Mktba.Application.Services.IndexNow;

/// <summary>
/// Tells search engines that a public page appeared, changed or went away, so they crawl it again
/// soon (O-12, #61). Never blocks and never fails the caller: the notice is sent in the background,
/// and without configuration it is dropped.
/// </summary>
public interface ISearchEngineNotifier
{
    /// <summary>
    /// The page of the article in <paramref name="locale"/> whose slug is <paramref name="slug"/>
    /// (<c>/{slug}</c>, or <c>/{locale}/{slug}</c> outside the default language).
    /// </summary>
    void ArticleChanged(string locale, string slug);
}
