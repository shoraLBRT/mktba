namespace Mktba.Domain.Entities;

public class School
{
    public int Id { get; set; }

    /// <summary>Уникальный идентификатор: hanafi, maliki, shafii, hanbali или custom-{articleId}-{n}</summary>
    public string Slug { get; set; } = string.Empty;

    /// <summary>Полное название школы на русском</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Сокращённое название для chip-вкладок (например «Хан», «Шаф»)</summary>
    public string ShortName { get; set; } = string.Empty;

    /// <summary>true — одна из 4 канонических суннитских школ, false — кастомная per-article</summary>
    public bool IsSystem { get; set; }

    /// <summary>null — системная школа; не null — кастомная школа, видна только в этой статье</summary>
    public int? ArticleScopeId { get; set; }

    public Article? ArticleScope { get; set; }

    public ICollection<OpinionSchool> OpinionSchools { get; set; } = new List<OpinionSchool>();
}
