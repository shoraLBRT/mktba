namespace Mktba.Domain.Entities;

/// <summary>A user credited as co-author of an article. The article's own author is never a co-author.</summary>
public class ArticleCoAuthor
{
    public int ArticleId { get; set; }

    public Article Article { get; set; } = null!;

    public int UserId { get; set; }

    public User User { get; set; } = null!;
}
