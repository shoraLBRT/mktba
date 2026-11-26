namespace Mktba.Application.DTOs
{
    // ── School ──────────────────────────────────────────────────────────────

    /// <summary>
    /// A school: one of the four canonical mazhabs, or a scholar opinion (M-08, #116) — a directory entry
    /// any article may link its opinions to.
    /// </summary>
    /// <param name="ArticleScopeId">The article a scholar opinion was created for (it decides who may change it, not where it is used); null for a system school or a directory entry.</param>
    /// <param name="ScholarName">The scholar whose opinion it is; null for a system school or an entry made before M-08.</param>
    /// <param name="ScholarYears">Years of the scholar's life, free text («661–728 гг. х.»).</param>
    /// <param name="Description">A short plain-text note on the scholar or the position.</param>
    /// <param name="ScholarArticleId">The wiki article about the scholar, as stored (whatever its status).</param>
    /// <param name="ScholarArticle">That article while it is Published and not in the trash, else null: the link readers get.</param>
    public record SchoolDto(
        int Id,
        string Slug,
        string Name,
        string ShortName,
        bool IsSystem,
        int? ArticleScopeId,
        string? ScholarName = null,
        string? ScholarYears = null,
        string? Description = null,
        int? ScholarArticleId = null,
        SchoolScholarArticleDto? ScholarArticle = null
    );

    /// <summary>The Published article about a scholar, enough to link it (<c>/{slug}</c>, or <c>/{locale}/{slug}</c> outside Russian).</summary>
    public record SchoolScholarArticleDto(int Id, string Slug, string Title, string Locale);

    /// <summary>
    /// A new scholar opinion. <paramref name="Slug"/> may be left out (the server makes one);
    /// <paramref name="ArticleScopeId"/> is the article it is created for — its editors may change it
    /// later — or null for an entry straight into the directory.
    /// </summary>
    public record SchoolCreateDto(
        string? Slug,
        string Name,
        string ShortName,
        int? ArticleScopeId,
        string? ScholarName = null,
        string? ScholarYears = null,
        string? Description = null,
        int? ScholarArticleId = null
    );

    /// <summary>The editable fields of a scholar opinion; every field is replaced (null or blank clears an optional one).</summary>
    public record SchoolUpdateDto(
        string Name,
        string ShortName,
        string? ScholarName = null,
        string? ScholarYears = null,
        string? Description = null,
        int? ScholarArticleId = null
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
        /// <summary>
        /// The sources this opinion cites, in order (M-07). On a write it replaces the citations of
        /// the opinion; an unknown source id fails with <c>source_not_found</c>.
        /// </summary>
        public List<OpinionSourceDto> Sources { get; set; } = new();
    }

    /// <param name="SchoolIds">Schools the opinion is linked to; must be empty when the paragraph has a single opinion (<c>paragraph_plain_schools_not_allowed</c>).</param>
    /// <param name="Sources">The sources the opinion cites, in order; null means none.</param>
    public record OpinionCreateDto(
        string Content,
        bool IsDefault,
        List<int> SchoolIds,
        List<OpinionSourceDto>? Sources = null
    );

    /// <param name="SchoolIds">Schools the opinion is linked to; must be empty when the paragraph has a single opinion (<c>paragraph_plain_schools_not_allowed</c>).</param>
    /// <param name="Sources">The sources the opinion cites, in order; replaces the current ones, null means none.</param>
    public record OpinionUpdateDto(
        int Id,                    // 0 = новый, >0 = обновить существующий
        string Content,
        bool IsDefault,
        List<int> SchoolIds,
        List<OpinionSourceDto>? Sources = null
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
