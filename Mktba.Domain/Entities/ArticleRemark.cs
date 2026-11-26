namespace Mktba.Domain.Entities;

/// <summary>Where a scholar's remark on a block stands (V-06, #122). Stored by name.</summary>
public enum ArticleRemarkStatus
{
    /// <summary>Waiting for the authors: they reply, fix the text and close it.</summary>
    Open = 1,

    /// <summary>Closed by the authors as fixed («исправлено»).</summary>
    Resolved = 2,

    /// <summary>Closed by the authors without a change («закрыто без исправлений»), e.g. after the discussion.</summary>
    Closed = 3,
}

/// <summary>
/// A verified scholar's remark on one block of a published article (V-06, #122): a paragraph, or one
/// opinion of a block of opinions, as it read in the revision the scholar was looking at. The remark
/// is a thread (<see cref="Messages"/>, the first one is the remark itself) between the scholar, the
/// article's authors and the editors; the authors close it, the scholar may reopen it. It is private
/// to them: readers never see it.
/// </summary>
/// <remarks>
/// The block is referred to by the working copy's ids, which an editor save keeps (paragraphs by the
/// ids the editor sends, opinions in place since #314). When the block is deleted the ids are set to
/// null (or left pointing at nothing on a provider without foreign keys) and the remark stays with
/// <see cref="Excerpt"/> and <see cref="ParagraphOrder"/>, so it still reads as «блок удалён».
/// </remarks>
public class ArticleRemark
{
    /// <summary>The longest message kept, the remark itself included.</summary>
    public const int MessageMaxLength = 4000;

    /// <summary>The longest excerpt of the block kept with the remark.</summary>
    public const int ExcerptMaxLength = 300;

    public int Id { get; set; }

    public int ArticleId { get; set; }

    public Article Article { get; set; } = null!;

    /// <summary>The revision the scholar read when making the remark (D5: marks belong to a revision).</summary>
    public int RevisionId { get; set; }

    public ArticleRevision Revision { get; set; } = null!;

    /// <summary>The scholar; their remarks go when the user is deleted, as their reviews do.</summary>
    public int ScholarId { get; set; }

    public User Scholar { get; set; } = null!;

    /// <summary>The paragraph remarked on; null once it is deleted.</summary>
    public int? ParagraphId { get; set; }

    /// <summary>The opinion remarked on, when the remark is about one opinion of a block; null once it is deleted.</summary>
    public int? OpinionId { get; set; }

    /// <summary>Whether the remark is about one opinion (<see cref="OpinionId"/>) rather than the whole paragraph.</summary>
    public bool OnOpinion { get; set; }

    /// <summary>The paragraph's <see cref="Paragraph.Order"/> in the remark's revision.</summary>
    public int ParagraphOrder { get; set; }

    /// <summary>The block's text in the remark's revision, as plain text, cut to <see cref="ExcerptMaxLength"/>.</summary>
    public string Excerpt { get; set; } = string.Empty;

    public ArticleRemarkStatus Status { get; set; } = ArticleRemarkStatus.Open;

    /// <summary>When the scholar made the remark (UTC).</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>The last reply, closing or reopening (UTC).</summary>
    public DateTime UpdatedAt { get; set; }

    /// <summary>When the remark was last closed (UTC); null while it is open.</summary>
    public DateTime? ClosedAt { get; set; }

    /// <summary>Who last closed it; null while it is open or once that user is deleted.</summary>
    public int? ClosedById { get; set; }

    public User? ClosedBy { get; set; }

    public List<ArticleRemarkMessage> Messages { get; set; } = [];
}

/// <summary>One message of a remark's thread (V-06, #122): plain text, line breaks kept.</summary>
public class ArticleRemarkMessage
{
    public int Id { get; set; }

    public int RemarkId { get; set; }

    public ArticleRemark Remark { get; set; } = null!;

    /// <summary>Who wrote it; null once that user is deleted (the message stays in the thread).</summary>
    public int? AuthorId { get; set; }

    public User? Author { get; set; }

    public string Body { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }
}
