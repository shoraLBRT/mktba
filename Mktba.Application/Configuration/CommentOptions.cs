namespace Mktba.Application.Configuration;

/// <summary>
/// The <c>Comments</c> configuration section (C-01, #127). The per-IP limit on writing, editing and
/// deleting comments is <c>RateLimiting:Comments</c>; this is the per-account one.
/// </summary>
public sealed class CommentOptions
{
    public const string SectionName = "Comments";

    /// <summary>
    /// Most comments one account may write in any <see cref="PerUserWindowSeconds"/>, counted from the
    /// table (deleted ones included), so it survives restarts; further ones are answered with 429
    /// <c>comment_limit_reached</c>. Zero or less: no cap.
    /// </summary>
    public int PerUserLimit { get; set; } = 10;

    public int PerUserWindowSeconds { get; set; } = 600;
}
