using Mktba.Application.Services.IndexNow;

namespace Mktba.Application.Tests;

/// <summary>Keeps the paths search engines would have been told about; sends nothing.</summary>
internal sealed class RecordingSearchEngineNotifier : ISearchEngineNotifier
{
    public List<string> Paths { get; } = [];

    public void ArticleChanged(string locale, string slug) => Paths.Add(IndexNowQueue.ArticlePath(locale, slug));
}
