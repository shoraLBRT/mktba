namespace Mktba.Domain.Entities;

/// <summary>
/// A school an opinion can be linked to: one of the four canonical mazhabs (<see cref="IsSystem"/>) or a
/// scholar opinion (M-08, #116) — a shared directory entry with the scholar's name, years of life, a note
/// and a link to the wiki article about the scholar, which any article may use.
/// </summary>
public class School
{
    public const int SlugMaxLength = 80;
    public const int NameMaxLength = 200;
    public const int ShortNameMaxLength = 20;
    public const int ScholarNameMaxLength = 200;
    public const int ScholarYearsMaxLength = 100;
    public const int DescriptionMaxLength = 2000;

    public int Id { get; set; }

    /// <summary>Уникальный идентификатор: hanafi, maliki, shafii, hanbali; у мнения учёного — любой свободный (по умолчанию scholar-{guid}).</summary>
    public string Slug { get; set; } = string.Empty;

    /// <summary>Полное название школы на русском</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Сокращённое название для chip-вкладок (например «Хан», «Шаф»)</summary>
    public string ShortName { get; set; } = string.Empty;

    /// <summary>true — одна из 4 канонических суннитских школ, false — мнение учёного (кастомная школа).</summary>
    public bool IsSystem { get; set; }

    /// <summary>
    /// The article the scholar opinion was created for, or null (a system school, an entry created
    /// straight into the directory, or one whose article was purged). Since M-08 (#116) it no longer
    /// limits where the school is used — any article may link its opinions to any custom school. It
    /// only says who, besides an admin, may change or delete the entry: an editor of this article,
    /// while no other article uses it.
    /// </summary>
    public int? ArticleScopeId { get; set; }

    public Article? ArticleScope { get; set; }

    /// <summary>The scholar whose opinion this is (for example «Ибн Таймия»); null for a system school or an entry made before M-08.</summary>
    public string? ScholarName { get; set; }

    /// <summary>Years of the scholar's life as free text, in any calendar («661–728 гг. х.», «ум. 241 г. х.»).</summary>
    public string? ScholarYears { get; set; }

    /// <summary>A short note on the scholar or the position, plain text.</summary>
    public string? Description { get; set; }

    /// <summary>The wiki article about the scholar; SetNull when it is purged. Readers get the link only while it is Published.</summary>
    public int? ScholarArticleId { get; set; }

    public Article? ScholarArticle { get; set; }

    /// <summary>Names in languages other than Russian; at most one per locale.</summary>
    public ICollection<SchoolTranslation> Translations { get; set; } = new List<SchoolTranslation>();

    public ICollection<OpinionSchool> OpinionSchools { get; set; } = new List<OpinionSchool>();
}
