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
        /// <summary>
        /// Schools this opinion is linked to. Allowed only when the paragraph has two or more opinions:
        /// a paragraph with a single opinion is common to all schools, and school ids on it are rejected
        /// with <c>paragraph_plain_schools_not_allowed</c>.
        /// </summary>
        public List<int> SchoolIds { get; set; } = new();
    }

    /// <param name="SchoolIds">Schools the opinion is linked to; must be empty when the paragraph has a single opinion (<c>paragraph_plain_schools_not_allowed</c>).</param>
    public record OpinionCreateDto(
        string Content,
        bool IsDefault,
        List<int> SchoolIds
    );

    /// <param name="SchoolIds">Schools the opinion is linked to; must be empty when the paragraph has a single opinion (<c>paragraph_plain_schools_not_allowed</c>).</param>
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
