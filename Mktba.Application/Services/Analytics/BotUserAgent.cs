using System.Text.RegularExpressions;

namespace Mktba.Application.Services.Analytics;

/// <summary>
/// Tells crawlers, headless browsers and scripts by the User-Agent of an analytics request
/// (N-03, #97). The header is only read here, on intake, to drop the request's events; it is never
/// stored or logged.
/// <para>
/// Every browser in use sends a header starting with <c>Mozilla/</c>; anything else — no header,
/// <c>curl/…</c>, <c>python-requests/…</c>, <c>WhatsApp/…</c> — is not a reader. Of the rest, a
/// bot that says so is matched by name: "bot", "crawl", "spider" and "slurp" cover Googlebot,
/// YandexBot, bingbot, Baiduspider, Yahoo! Slurp, TelegramBot and most others (but not the Cubot phones); then link previews,
/// headless and automated browsers, page audits and HTTP libraries that borrow a browser's name.
/// A bot that passes for a browser is not caught here: the browser itself also sends nothing when
/// it is driven by automation (<c>navigator.webdriver</c>, <c>src/analytics/events.ts</c>).
/// </para>
/// </summary>
public static partial class BotUserAgent
{
    public static bool IsBot(string? userAgent)
        => string.IsNullOrWhiteSpace(userAgent)
            || !userAgent.StartsWith("Mozilla/", StringComparison.Ordinal)
            || BotPattern().IsMatch(userAgent);

    [GeneratedRegex(
        @"(?<!cu)bot|crawl|spider|slurp|archiver|scraper|preview|facebookexternalhit|embedly|mediapartners|"
        + @"headless|phantomjs|selenium|puppeteer|playwright|webdriver|"
        + @"lighthouse|pagespeed|gtmetrix|pingdom|"
        + @"curl|wget|python|httpclient|okhttp|go-http|java/|libwww|axios|node-fetch",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex BotPattern();
}
