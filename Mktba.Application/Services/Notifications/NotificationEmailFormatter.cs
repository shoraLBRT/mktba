using System.Text;
using Mktba.Application.Configuration;
using Mktba.Domain.Entities;

namespace Mktba.Application.Services.Notifications;

/// <summary>
/// The text of a notification's email (V-09, #125): plain text in Russian, the only place it is
/// worded. The subject names no article and no person, so a log line with it says nothing private;
/// the body has the recipient's profile name, the article's title and the links — never a remark's
/// message, a refusal's reason or a review's comment.
/// </summary>
public static class NotificationEmailFormatter
{
    public static string Subject(Notification notification, EmailOptions options) =>
        $"{Topic(notification.Type)} — {options.SiteName}";

    public static string Body(Notification notification, string? recipientName, EmailOptions options)
    {
        var site = options.SiteBaseUrl ?? string.Empty;
        var text = new StringBuilder();
        text.Append(string.IsNullOrWhiteSpace(recipientName) ? "Здравствуйте!" : $"Здравствуйте, {OneLine(recipientName)}!").Append("\n\n");
        text.Append(What(notification)).Append("\n\n");
        text.Append("Открыть: ").Append(site).Append(notification.Link).Append("\n\n");
        text.Append("Какие письма присылать, можно выбрать в профиле: ").Append(site).Append("/admin/profile").Append('\n');
        text.Append("— ").Append(options.SiteName).Append('\n');
        return text.ToString();
    }

    private static string Topic(NotificationType type) => type switch
    {
        NotificationType.ScholarApplicationApproved => "Заявка учёного одобрена",
        NotificationType.ScholarApplicationRejected => "Заявка учёного отклонена",
        NotificationType.ScholarStatusRevoked => "Статус учёного снят",
        NotificationType.ArticleReviewed => "Учёный проверил вашу статью",
        NotificationType.ReReviewRequested => "Нужно повторное ревью статьи",
        NotificationType.RemarkCreated => "Новое замечание к вашей статье",
        NotificationType.RemarkReplied => "Новый ответ в замечании",
        NotificationType.RemarkClosed => "Замечание закрыто",
        NotificationType.RemarkReopened => "Замечание открыто снова",
        _ => "Уведомление",
    };

    private static string What(Notification notification)
    {
        var title = $"«{OneLine(notification.ArticleTitle ?? string.Empty)}»";
        return notification.Type switch
        {
            NotificationType.ScholarApplicationApproved => "Вашу заявку на статус учёного одобрили: теперь вы можете проверять статьи.",
            NotificationType.ScholarApplicationRejected => "Вашу заявку на статус учёного отклонили. Причина указана на странице заявки.",
            NotificationType.ScholarStatusRevoked => "С вас сняли статус учёного. Причина указана на странице заявки.",
            NotificationType.ArticleReviewed => $"Учёный оставил отметку «{Verdict(notification.Verdict)}» к статье {title}.",
            NotificationType.ReReviewRequested =>
                $"В статье {title} после вашей отметки изменился текст, который она охватывает. Посмотрите статью ещё раз.",
            NotificationType.RemarkCreated => $"Учёный оставил замечание к статье {title}.",
            NotificationType.RemarkReplied => $"Новый ответ в замечании к статье {title}.",
            NotificationType.RemarkClosed => notification.RemarkStatus == ArticleRemarkStatus.Resolved
                ? $"Замечание к статье {title} закрыто как исправленное."
                : $"Замечание к статье {title} закрыто без исправлений.",
            NotificationType.RemarkReopened => $"Замечание к статье {title} снова открыто.",
            _ => "На сайте новое уведомление.",
        };
    }

    private static string Verdict(ArticleReviewVerdict? verdict) => verdict switch
    {
        ArticleReviewVerdict.Confirmed => "подтверждаю",
        ArticleReviewVerdict.ConfirmedWithRemarks => "подтверждаю с замечаниями",
        ArticleReviewVerdict.HasErrors => "есть ошибки",
        _ => "без оценки",
    };

    /// <summary>A user's or an author's text on one line, so it cannot add lines or headers of its own.</summary>
    private static string OneLine(string value) =>
        string.Join(' ', value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
}
