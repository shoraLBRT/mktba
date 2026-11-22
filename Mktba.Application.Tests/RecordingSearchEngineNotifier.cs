using Mktba.Application.Services.IndexNow;

namespace Mktba.Application.Tests;

/// <summary>Keeps the slugs search engines would have been told about; sends nothing.</summary>
internal sealed class RecordingSearchEngineNotifier : ISearchEngineNotifier
{
    public List<string> Slugs { get; } = [];

    public void ArticleChanged(string slug) => Slugs.Add(slug);
}
