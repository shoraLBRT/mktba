namespace Mktba.Application.DTOs
{
    // ── School ──────────────────────────────────────────────────────────────

    public record SchoolDto(
        int Id,
        string Slug,
        string Name,
        string ShortName,
        bool IsSystem,
        int? ArticleScopeId
    );

    public record SchoolCreateDto(
        string Slug,
        string Name,
        string ShortName,
        int ArticleScopeId         // кастомные школы всегда привязаны к статье
    );

    // ── Opinion ─────────────────────────────────────────────────────────────

    public class OpinionDto
    {
        public int Id { get; set; }
        public string Content { get; set; } = string.Empty;
        public bool IsDefault { get; set; }
        public List<int> SchoolIds { get; set; } = new();
    }

    public record OpinionCreateDto(
        string Content,
        bool IsDefault,
        List<int> SchoolIds
    );

    public record OpinionUpdateDto(
        int Id,                    // 0 = новый, >0 = обновить существующий
        string Content,
        bool IsDefault,
        List<int> SchoolIds
    );

    // ── Paragraph (slot) ─────────────────────────────────────────────────────

    /// <summary>Ответ: слот параграфа с вложенными мнениями.</summary>
    public class ParagraphDto
    {
        public int Id { get; set; }
        public int Order { get; set; }
        public List<OpinionDto> Opinions { get; set; } = new();
    }

    /// <summary>Создание слота с мнениями за один вызов.</summary>
    public class ParagraphCreateDto
    {
        public int ArticleId { get; set; }
        public int Order { get; set; }
        public List<OpinionCreateDto> Opinions { get; set; } = new();
    }

    /// <summary>Обновление слота (порядок + мнения).</summary>
    public class ParagraphUpdateDto
    {
        public int Order { get; set; }
        public List<OpinionUpdateDto> Opinions { get; set; } = new();
    }

    // Kept for AutoMapper — maps Paragraph entity for list endpoints
    public class ParagraphReadDto
    {
        public int Id { get; set; }
        public int ArticleId { get; set; }
        public int Order { get; set; }
        public List<OpinionDto> Opinions { get; set; } = new();
    }
}
