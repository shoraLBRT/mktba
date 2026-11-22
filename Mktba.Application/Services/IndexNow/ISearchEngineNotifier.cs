namespace Mktba.Application.Services.IndexNow;

/// <summary>
/// Tells search engines that a public page appeared, changed or went away, so they crawl it again
/// soon (O-12, #61). Never blocks and never fails the caller: the notice is sent in the background,
/// and without configuration it is dropped.
/// </summary>
public interface ISearchEngineNotifier
{
    /// <summary>The page of the article whose slug is <paramref name="slug"/> (<c>/{slug}</c>).</summary>
    void ArticleChanged(string slug);
}
