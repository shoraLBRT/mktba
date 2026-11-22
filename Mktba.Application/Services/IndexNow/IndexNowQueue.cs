using System.Threading.Channels;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;

namespace Mktba.Application.Services.IndexNow;

/// <summary>
/// The in-memory queue of site paths waiting to be sent to IndexNow; the API's worker drains it.
/// Without configuration nothing is queued. The queue does not survive a restart and keeps at most
/// <see cref="Capacity"/> paths (the oldest go first): a lost notice only means the engines learn
/// of the page from the sitemap, as before.
/// </summary>
public sealed class IndexNowQueue : ISearchEngineNotifier
{
    public const int Capacity = IndexNowOptions.MaxUrlsPerRequest;

    private readonly Channel<string> _paths = Channel.CreateBounded<string>(
        new BoundedChannelOptions(Capacity) { FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true });

    private readonly bool _configured;

    public IndexNowQueue(IOptions<IndexNowOptions> options) => _configured = options.Value.IsConfigured;

    public ChannelReader<string> Reader => _paths.Reader;

    public void ArticleChanged(string slug)
    {
        if (_configured && !string.IsNullOrEmpty(slug))
        {
            _paths.Writer.TryWrite(ArticlePath(slug));
        }
    }

    /// <summary>The article's public path, as the frontend's <c>articleHref</c> builds it.</summary>
    public static string ArticlePath(string slug) => "/" + Uri.EscapeDataString(slug);
}
