using System.Text;
using Mktba.Application.Configuration;
using Mktba.Domain.Entities;

namespace Mktba.Application.Services.Accounts;

/// <summary>
/// The text of an account email (U-05, #126): plain text in Russian, the only place it is worded. The
/// subject carries no address and no link, so the log line of <c>LogEmailSender</c> says nothing
/// private; the token is only in the body's link, after <c>#</c>, so a browser never sends it to a
/// server (no access log, no <c>Referer</c>): the page reads it and posts it.
/// </summary>
public static class AccountEmailFormatter
{
    /// <summary>The page of each link; the token follows as <c>#token=…</c>.</summary>
    public const string ConfirmEmailPath = "/confirm-email";

    public const string ResetPasswordPath = "/reset-password";

    public static string Subject(AccountEmailPurpose purpose, EmailOptions options) => purpose switch
    {
        AccountEmailPurpose.EmailConfirmation => $"Подтвердите адрес почты — {options.SiteName}",
        AccountEmailPurpose.PasswordReset => $"Сброс пароля — {options.SiteName}",
        _ => $"Попытка регистрации — {options.SiteName}",
    };

    /// <param name="rawToken">The token of the link; null for <see cref="AccountEmailPurpose.SignUpAttempt"/>, which has none.</param>
    /// <param name="lifetime">How long the link works.</param>
    public static string Body(AccountEmailPurpose purpose, string? recipientName, string? rawToken, TimeSpan lifetime, EmailOptions options)
    {
        var site = options.SiteBaseUrl ?? string.Empty;
        var text = new StringBuilder();
        text.Append(string.IsNullOrWhiteSpace(recipientName) ? "Здравствуйте!" : $"Здравствуйте, {OneLine(recipientName)}!").Append("\n\n");
        switch (purpose)
        {
            case AccountEmailPurpose.EmailConfirmation:
                text.Append("Чтобы подтвердить, что это ваш адрес, откройте ссылку:\n");
                text.Append(site).Append(ConfirmEmailPath).Append("#token=").Append(rawToken).Append("\n\n");
                text.Append("Ссылка действует ").Append(Duration(lifetime)).Append(". Если вы не регистрировались, просто удалите это письмо.\n");
                break;
            case AccountEmailPurpose.PasswordReset:
                text.Append("Чтобы задать новый пароль, откройте ссылку:\n");
                text.Append(site).Append(ResetPasswordPath).Append("#token=").Append(rawToken).Append("\n\n");
                text.Append("Ссылка действует ").Append(Duration(lifetime))
                    .Append(". После смены пароля все входы в аккаунт будут завершены. ")
                    .Append("Если вы не просили сбросить пароль, просто удалите это письмо: пароль останется прежним.\n");
                break;
            default:
                text.Append("Кто-то попробовал зарегистрироваться с вашим адресом, но аккаунт с ним уже есть.\n\n");
                text.Append("Если это были вы, войдите: ").Append(site).Append("/login\n");
                text.Append("Забыли пароль? Его можно сбросить: ").Append(site).Append(ResetPasswordPath).Append('\n');
                text.Append("Если это были не вы, ничего делать не нужно.\n");
                break;
        }

        text.Append("\n— ").Append(options.SiteName).Append('\n');
        return text.ToString();
    }

    private static string Duration(TimeSpan lifetime)
    {
        if (lifetime.TotalHours < 1)
        {
            return $"{Math.Max(1, (int)lifetime.TotalMinutes)} мин";
        }

        var hours = (int)lifetime.TotalHours;
        return hours % 24 == 0 && hours >= 24 ? $"{hours / 24} сут." : $"{hours} ч";
    }

    private static string OneLine(string value) => string.Join(' ', value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
}
