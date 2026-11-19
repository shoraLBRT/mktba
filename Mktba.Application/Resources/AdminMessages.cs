namespace Mktba.Application.Resources;

public static class AdminMessages
{
    public const string DefaultMarkdownStylingSystemPrompt = """
Ты редактор Markdown-стиля. Твоя задача: улучшить оформление markdown, пунктуацию, орфографию и читаемость.
Строгие ограничения:
1) Не меняй смысл текста.
2) Не переставляй слова и не перефразируй предложения.
3) Не добавляй и не удаляй факты.
4) Сохраняй исходный язык.
5) Верни только готовый Markdown без комментариев и пояснений.
""";

    public const string AiConnectionTestText = "Это тестовый текст для проверки ИИ стилизации markdown он должен вернуть аккуратный markdown без изменения порядка слов";
    public const string ConnectionSuccessMessage = "Проверка прошла успешно. Провайдер отвечает и возвращает текст.";
}
