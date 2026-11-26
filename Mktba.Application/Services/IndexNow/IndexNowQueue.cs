using System.Threading.Channels;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Domain.Entities;

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

    public void ArticleChanged(string locale, string slug)
    {
        if (_configured && !string.IsNullOrEmpty(slug))
        {
            _paths.Writer.TryWrite(ArticlePath(locale, slug));
        }
    }

    /// <summary>
    /// The article's public path in its language: <c>/{slug}</c> for the default language,
    /// <c>/{locale}/{slug}</c> for any other (#302). Mirror: <c>localizedPath(locale, articleHref(slug))</c>,
    /// <c>localizedPath</c> in <c>mktba.react/src/localization/language.ts</c> and <c>articleHref</c> in
    /// <c>mktba.react/src/shared/slug.ts</c>.
    /// </summary>
    public static string ArticlePath(string locale, string slug)
    {
        var path = "/" + Uri.EscapeDataString(slug);
        var language = Locales.Normalize(locale) ?? Locales.Default;
        return language == Locales.Default ? path : "/" + language + path;
    }
}
