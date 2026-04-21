namespace Mktba.Domain.Entities;

/// <summary>Слот параграфа — задаёт порядок блока в статье. Содержимое хранится в Opinion.</summary>
public class Paragraph
{
    public int Id { get; set; }

    public int ArticleId { get; set; }

    public Article Article { get; set; } = null!;

    /// <summary>Порядковый номер блока в статье (1-based, шаг 10)</summary>
    public int Order { get; set; }

    public ICollection<Opinion> Opinions { get; set; } = new List<Opinion>();
}
