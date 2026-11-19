namespace Mktba.Application.DTOs
{
    public class AdminCleanupResultDto
    {
        public int DeletedArticles { get; set; }
        public int DeletedParagraphs { get; set; }
        public string Message { get; set; } = string.Empty;
    }

    public class AiProviderSettingsDto
    {
        public string BaseUrl { get; set; } = string.Empty;
        public string Model { get; set; } = string.Empty;
        public bool IsEnabled { get; set; }
        public bool HasApiKey { get; set; }

        /// <summary>
        /// True when base URL, model and API key are all set. AI features refuse with
        /// <c>ai_provider_not_configured</c> until then; there is no default provider.
        /// </summary>
        public bool IsConfigured { get; set; }

        public string? MarkdownStylingSystemPrompt { get; set; }
    }

    public class UpdateAiProviderSettingsDto
    {
        public string BaseUrl { get; set; } = string.Empty;
        public string Model { get; set; } = string.Empty;
        public bool IsEnabled { get; set; }
        public string? ApiKey { get; set; }
        public string? MarkdownStylingSystemPrompt { get; set; }
    }

    public class AiStyleRequestDto
    {
        public string Text { get; set; } = string.Empty;
    }

    public class AiStyleResponseDto
    {
        public string StyledText { get; set; } = string.Empty;
    }

    public class AiConnectionCheckResultDto
    {
        public string Message { get; set; } = string.Empty;
        public string StyledText { get; set; } = string.Empty;
    }
}
