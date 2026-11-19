using System.Globalization;
using System.Text;
using Mktba.Domain.Entities;

namespace Mktba.Application.Services.Feedback;

/// <summary>
/// What a feedback message looks like as a GitHub issue (F-02, #67). The repository is public
/// (decision D9, #37): the issue carries the type, the text, the page, the article and the mazhab,
/// and never the contact — only whether one was left, with the message number to find it in the
/// site's database. The visitor's text and page URL go in as they were stored: neutralising
/// @-mentions and markup in them is F-03 (#68).
/// </summary>
public static class FeedbackIssueFormatter
{
    public static readonly IReadOnlyList<string> Labels = ["feedback", "needs-triage"];

    private const int TitleArticleMaxLength = 150;

    /// <summary>
    /// The hidden line that ties an issue to its message: a retry looks for it before creating
    /// anything, so an attempt that was cut off after GitHub created the issue is not repeated.
    /// </summary>
    public static string Marker(Guid deliveryKey) => $"<!-- mktba-feedback:{deliveryKey:N} -->";

    /// <param name="message">The stored message.</param>
    /// <param name="articleTitle">Title of the article the message is about, when it is published; otherwise null.</param>
    public static string Title(FeedbackMessage message, string? articleTitle)
    {
        var title = $"Обратная связь №{message.Id}: {TypeName(message.Type)}";
        if (articleTitle is null)
        {
            return title;
        }

        var shown = articleTitle.Length > TitleArticleMaxLength ? articleTitle[..TitleArticleMaxLength] + "…" : articleTitle;
        return message.Type == FeedbackType.ArticleError ? $"{title} «{shown}»" : $"{title} (статья «{shown}»)";
    }

    /// <param name="message">The stored message.</param>
    /// <param name="articleTitle">As in <see cref="Title"/>.</param>
    /// <param name="mazhabName">Name of the school the visitor had chosen, or null.</param>
    public static string Body(FeedbackMessage message, string? articleTitle, string? mazhabName)
    {
        var body = new StringBuilder();
        body.Append("- **Тип:** ").Append(TypeName(message.Type)).Append('\n');
        if (articleTitle is not null)
        {
            body.Append("- **Статья:** «").Append(articleTitle).Append("»\n");
        }
        else if (message.ArticleId is int articleId)
        {
            body.Append("- **Статья:** №").Append(articleId).Append(" (не опубликована)\n");
        }

        if (message.PageUrl is not null)
        {
            body.Append("- **Страница:** ").Append(message.PageUrl).Append('\n');
        }

        if (mazhabName is not null)
        {
            body.Append("- **Мазхаб читателя:** ").Append(mazhabName).Append('\n');
        }

        body.Append("- **Контакт:** ")
            .Append(message.Contact is null
                ? "не оставлен"
                : $"оставлен; хранится только в базе сайта, обращение №{message.Id}")
            .Append('\n');
        body.Append("- **Получено:** ")
            .Append(message.CreatedAtUtc.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture))
            .Append(" UTC\n");
        body.Append("\n---\n\n").Append(message.Text).Append("\n\n").Append(Marker(message.DeliveryKey)).Append('\n');
        return body.ToString();
    }

    private static string TypeName(FeedbackType type) => type switch
    {
        FeedbackType.ArticleError => "ошибка в статье",
        FeedbackType.SiteProblem => "неполадка сайта",
        FeedbackType.Idea => "идея",
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, null),
    };
}
