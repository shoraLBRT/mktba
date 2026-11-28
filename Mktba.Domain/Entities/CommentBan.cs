namespace Mktba.Domain.Entities;

/// <summary>
/// A user barred from writing and editing comments (C-02, #128): one row per user, given by a
/// moderator, until a moment or for good. An expired ban no longer counts; the next ban replaces it.
/// </summary>
public class CommentBan
{
    /// <summary>The longest reason kept, after trimming.</summary>
    public const int ReasonMaxLength = 500;

    public int Id { get; set; }

    public int UserId { get; set; }

    public User User { get; set; } = null!;

    /// <summary>When it ends (UTC); null: for good.</summary>
    public DateTime? Until { get; set; }

    /// <summary>Why, as the moderator wrote it; shown to the moderators only.</summary>
    public string? Reason { get; set; }

    /// <summary>When it was given (UTC).</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>The moderator who gave it; null once that user is deleted.</summary>
    public int? CreatedById { get; set; }

    public User? CreatedBy { get; set; }
}
