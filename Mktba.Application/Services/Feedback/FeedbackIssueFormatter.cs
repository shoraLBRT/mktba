using System.Globalization;
using System.Text;
using Mktba.Domain.Entities;

namespace Mktba.Application.Services.Feedback;

/// <summary>
/// What a feedback message looks like as a GitHub issue (F-02 #67, F-03 #68). The repository is
/// public (decision D9, #37): the issue carries the type, the text, the page, the article and the
/// mazhab, and never the contact — only whether one was left, with the message number to find it
/// in the site's database.
/// <para>
/// This is the one place where a visitor's words become Markdown, and they never become markup:
/// the text goes into a fenced code block whose fence is longer than any run of backticks in it,
/// the page URL, the article title and the mazhab name into code spans built the same way. GitHub
/// parses nothing inside code — no @-mentions, no <c>#123</c> / <c>owner/repo#1</c> / commit
/// references (so no notifications and no cross-links in other issues), no links, images or
/// HTML — and the text cannot close its block, so it cannot place the hidden marker either.
/// Characters that reorder the displayed text (bidi embeddings, overrides and isolates) are removed.
/// </para>
/// </summary>
public static class FeedbackIssueFormatter
{
    public static readonly IReadOnlyList<string> Labels = ["feedback", "needs-triage"];

    /// <summary>GitHub refuses an issue body longer than this.</summary>
    public const int GitHubBodyMaxLength = 65536;

    private const int ArticleTitleMaxLength = 150;

    /// <summary>
    /// The hidden line that ties an issue to its message: a retry looks for it before creating
    /// anything, so an attempt that was cut off after GitHub created the issue is not repeated.
    /// </summary>
    public static string Marker(Guid deliveryKey) => $"<!-- mktba-feedback:{deliveryKey:N} -->";

    /// <summary>
    /// Whether <paramref name="body"/> is an issue body made by <see cref="Body"/> for this marker:
    /// the marker is its last line. The same characters anywhere else — quoted in a visitor's text,
    /// say — do not count.
    /// </summary>
    public static bool EndsWithMarker(string body, string marker)
    {
        var trimmed = body.AsSpan().TrimEnd();
        return trimmed.EndsWith(marker, StringComparison.Ordinal)
            && (trimmed.Length == marker.Length || trimmed[^(marker.Length + 1)] == '\n');
    }

    /// <param name="message">The stored message.</param>
    /// <param name="articleTitle">Title of the article the message is about, when it is published; otherwise null.</param>
    public static string Title(FeedbackMessage message, string? articleTitle)
    {
        var title = $"Обратная связь №{message.Id}: {TypeName(message.Type)}";
        if (articleTitle is null)
        {
            return title;
        }

        var shown = ShortTitle(articleTitle);
        return message.Type == FeedbackType.ArticleError ? $"{title} «{shown}»" : $"{title} (статья «{shown}»)";
    }

    /// <param name="message">The stored message.</param>
    /// <param name="articleTitle">As in <see cref="Title"/>.</param>
    /// <param name="mazhabName">Name of the canonical school the visitor had chosen (the site's own data), or null.</param>
    /// <returns>The body; with the limits of <see cref="FeedbackMessage"/> it stays far below <see cref="GitHubBodyMaxLength"/>.</returns>
    public static string Body(FeedbackMessage message, string? articleTitle, string? mazhabName)
    {
        var body = new StringBuilder();
        body.Append("- **Тип:** ").Append(TypeName(message.Type)).Append('\n');
        if (articleTitle is not null)
        {
            body.Append("- **Статья:** ").Append(CodeSpan(ShortTitle(articleTitle))).Append('\n');
        }
        else if (message.ArticleId is int articleId)
        {
            body.Append("- **Статья:** №").Append(articleId).Append(" (не опубликована)\n");
        }

        if (message.PageUrl is not null)
        {
            body.Append("- **Страница:** ").Append(CodeSpan(message.PageUrl)).Append('\n');
        }

        if (mazhabName is not null)
        {
            body.Append("- **Мазхаб читателя:** ").Append(CodeSpan(mazhabName)).Append('\n');
        }

        body.Append("- **Контакт:** ")
            .Append(message.Contact is null
                ? "не оставлен"
                : $"оставлен; хранится только в базе сайта, обращение №{message.Id}")
            .Append('\n');
        body.Append("- **Получено:** ")
            .Append(message.CreatedAtUtc.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture))
            .Append(" UTC\n");
        body.Append("\n**Текст посетителя** (как написан, разметка в нём не действует):\n\n")
            .Append(CodeBlock(message.Text))
            .Append("\n\n")
            .Append(Marker(message.DeliveryKey))
            .Append('\n');
        return body.ToString();
    }

    /// <summary>
    /// The text as a fenced code block. A block is closed only by a line of at least as many
    /// backticks as opened it, and the text has no run that long.
    /// </summary>
    private static string CodeBlock(string text)
    {
        var content = Inert(text, keepLineBreaks: true);
        var fence = new string('`', Math.Max(3, LongestBacktickRun(content) + 1));
        return $"{fence}text\n{content}\n{fence}";
    }

    /// <summary>
    /// The value as a one-line code span. A span is closed only by a run of exactly as many
    /// backticks as opened it, and the value has no run that long; the spaces keep a value that
    /// starts or ends with a backtick apart from the delimiters.
    /// </summary>
    private static string CodeSpan(string value)
    {
        var content = Inert(value, keepLineBreaks: false);
        var delimiter = new string('`', LongestBacktickRun(content) + 1);
        return $"{delimiter} {content} {delimiter}";
    }

    private static string ShortTitle(string articleTitle) =>
        articleTitle.Length > ArticleTitleMaxLength ? articleTitle[..ArticleTitleMaxLength] + "…" : articleTitle;

    /// <summary>
    /// Line breaks as "\n" (or as spaces), no other control characters, no characters that change
    /// the direction the text is displayed in. Intake already cleans what it stores; this holds for
    /// any row, however it got into the table.
    /// </summary>
    private static string Inert(string value, bool keepLineBreaks)
    {
        var builder = new StringBuilder(value.Length);
        foreach (var current in value.ReplaceLineEndings("\n"))
        {
            if (current == '\n')
            {
                builder.Append(keepLineBreaks ? '\n' : ' ');
            }
            else if (current == '\t' || (!char.IsControl(current) && !IsBidiControl(current)))
            {
                builder.Append(current);
            }
        }

        return builder.ToString();
    }

    /// <summary>U+202A–U+202E (embeddings and overrides) and U+2066–U+2069 (isolates).</summary>
    private static bool IsBidiControl(char value) => value is (>= (char)0x202A and <= (char)0x202E) or (>= (char)0x2066 and <= (char)0x2069);

    private static int LongestBacktickRun(string value)
    {
        var longest = 0;
        var current = 0;
        foreach (var character in value)
        {
            current = character == '`' ? current + 1 : 0;
            longest = Math.Max(longest, current);
        }

        return longest;
    }

    private static string TypeName(FeedbackType type) => type switch
    {
        FeedbackType.ArticleError => "ошибка в статье",
        FeedbackType.SiteProblem => "неполадка сайта",
        FeedbackType.Idea => "идея",
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, null),
    };
}
