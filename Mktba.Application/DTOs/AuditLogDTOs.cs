using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs;

/// <summary>A user an audit log entry names, as they are now (U-09, #135). Admin only: it carries the email.</summary>
public class AuditLogUserDto
{
    public int Id { get; set; }
    public string Email { get; set; } = string.Empty;
    /// <summary>The name from the user's profile; null while they have not set one.</summary>
    public string? DisplayName { get; set; }
}

/// <summary>One entry of the audit log (U-09, #135): who did what, to which article or user, and when.</summary>
public class AuditLogEntryDto
{
    public long Id { get; set; }
    /// <summary>When it happened (UTC).</summary>
    public DateTime OccurredAt { get; set; }
    public AuditAction Action { get; set; }
    /// <summary>The id of the user who did it; null when the action had no signed-in user.</summary>
    public int? ActorId { get; set; }
    /// <summary>That user as they are now; null when there was none or the user no longer exists.</summary>
    public AuditLogUserDto? Actor { get; set; }
    /// <summary>The article acted on, for the article actions.</summary>
    public int? ArticleId { get; set; }
    /// <summary>The article's title at the time of the action.</summary>
    public string? ArticleTitle { get; set; }
    /// <summary>True while the article exists outside the trash, so it can be opened.</summary>
    public bool ArticleAvailable { get; set; }
    /// <summary>The user acted on, for a role change.</summary>
    public int? TargetUserId { get; set; }
    /// <summary>That user as they are now; null when the user no longer exists.</summary>
    public AuditLogUserDto? TargetUser { get; set; }
    /// <summary>The value before: an <see cref="ArticleStatus"/> for a status move, a <see cref="UserRole"/> for a role change.</summary>
    public string? FromValue { get; set; }
    /// <summary>The value after, of the same kind as <see cref="FromValue"/>.</summary>
    public string? ToValue { get; set; }
}

/// <summary>One page of the audit log, newest first.</summary>
public class AuditLogPageDto
{
    public List<AuditLogEntryDto> Items { get; set; } = new();
    /// <summary>Number of entries matching the filters, over all pages.</summary>
    public int Total { get; set; }
    /// <summary>The 1-based page returned, after bounds were applied.</summary>
    public int Page { get; set; }
    /// <summary>The page size used, after bounds were applied (1 to 100).</summary>
    public int PageSize { get; set; }
}
