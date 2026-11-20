namespace Mktba.Domain.Entities;

/// <summary>An article carries a <see cref="Tag"/> of its own language, at a position among its tags.</summary>
public class ArticleTag
{
    public int ArticleId { get; set; }

    public Article Article { get; set; } = null!;

    public int TagId { get; set; }

    public Tag Tag { get; set; } = null!;

    /// <summary>0-based position among the article's tags, in the order the editor gave them.</summary>
    public int Order { get; set; }
}
