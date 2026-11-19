namespace Mktba.Domain.Entities;

/// <summary>
/// The admin-configured AI provider. There is no default provider (decision D8, #2): a fresh
/// install starts with empty settings and AI features stay off until an admin fills them in.
/// </summary>
public class AiProviderSettings
{
    public int Id { get; set; }
    public string BaseUrl { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
    public string? ApiKey { get; set; }
    public bool IsEnabled { get; set; }
    public string? MarkdownStylingSystemPrompt { get; set; }
}
