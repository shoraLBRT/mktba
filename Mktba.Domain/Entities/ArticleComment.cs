namespace Mktba.Domain.Entities;

/// <summary>
/// A reader's comment under a published article (C-01, #127): a top-level comment or a reply to
/// another comment of the same article (<see cref="ParentId"/>), so the comments form a tree.
/// </summary>
/// <remarks>
/// The body is the «Markdown-минимум» the author typed (bold, italic, links, inline code, code
/// blocks, quotes); the server stores it as text and never turns it into HTML — the page renders it
/// through a restricted Markdown schema without raw HTML. A deleted comment is kept as a row with an
/// empty body and <see cref="DeletedAt"/> set, so its replies keep their place («комментарий удалён»).
/// </remarks>
public class ArticleComment
{
    /// <summary>The longest body kept, in UTF-16 code units as typed (after trimming).</summary>
    public const int BodyMaxLength = 2000;

    public int Id { get; set; }

    public int ArticleId { get; set; }

    public Article Article { get; set; } = null!;

    /// <summary>Who wrote it; null once that user is deleted (the comment and its replies stay).</summary>
    public int? AuthorId { get; set; }

    public User? Author { get; set; }

    /// <summary>The comment this one answers; null for a top-level comment. Always a comment of the same article.</summary>
    public int? ParentId { get; set; }

    public ArticleComment? Parent { get; set; }

    /// <summary>The text as Markdown source; empty once the comment is deleted.</summary>
    public string Body { get; set; } = string.Empty;

    /// <summary>When it was written (UTC).</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>When its author last changed the text (UTC); null while it is as first written.</summary>
    public DateTime? EditedAt { get; set; }

    /// <summary>When it was deleted (UTC), by its author or an admin; null while it stands.</summary>
    public DateTime? DeletedAt { get; set; }

    /// <summary>Who deleted it; null while it stands or once that user is deleted.</summary>
    public int? DeletedById { get; set; }

    public User? DeletedBy { get; set; }
}
