namespace Mktba.Domain.Entities;

/// <summary>What an <see cref="AuditLogEntry"/> records (U-09, #135). Stored by name.</summary>
public enum AuditAction
{
    /// <summary>An article's status moved (publication included): <see cref="AuditLogEntry.FromValue"/> → <see cref="AuditLogEntry.ToValue"/>.</summary>
    ArticleStatusChanged = 1,

    /// <summary>An article was moved to the trash.</summary>
    ArticleTrashed = 2,

    /// <summary>An article was taken out of the trash.</summary>
    ArticleRestored = 3,

    /// <summary>A trashed article was deleted for good.</summary>
    ArticlePurged = 4,

    /// <summary>A user was given another role: <see cref="AuditLogEntry.FromValue"/> → <see cref="AuditLogEntry.ToValue"/>.</summary>
    UserRoleChanged = 5,

    /// <summary>
    /// An admin approved a scholar application (V-02, #118); <see cref="AuditLogEntry.TargetUserId"/> is
    /// the applicant. The role change it makes is its own <see cref="UserRoleChanged"/> entry.
    /// </summary>
    ScholarApplicationApproved = 6,

    /// <summary>An admin refused a scholar application (V-02, #118); <see cref="AuditLogEntry.TargetUserId"/> is the applicant.</summary>
    ScholarApplicationRejected = 7,

    /// <summary>
    /// An admin took back a user's scholar status (V-02, #118); the role change is its own
    /// <see cref="UserRoleChanged"/> entry.
    /// </summary>
    ScholarStatusRevoked = 8,

    /// <summary>
    /// A scholar reviewed a revision of an article (V-03, #119): <see cref="AuditLogEntry.ToValue"/> is the
    /// verdict, <see cref="AuditLogEntry.FromValue"/> the verdict it replaced on the same revision (null for a first review).
    /// </summary>
    ArticleReviewed = 9,
}

/// <summary>
/// One entry of the audit log (U-09, #135): who did what to which article or user, and when. Written
/// in the same save as the action itself, so an action and its entry are stored together or not at
/// all. Append-only: nothing updates or deletes a row, and nothing removes old rows.
/// The ids are plain columns without foreign keys, so an entry outlives the article (a purge is
/// itself an entry) and the user it names. Nothing else about the request is kept — no IP address,
/// no User-Agent.
/// </summary>
public class AuditLogEntry
{
    public long Id { get; set; }

    /// <summary>When the action happened (UTC).</summary>
    public DateTime OccurredAt { get; set; }

    /// <summary>The signed-in user who did it; null when the action had no user.</summary>
    public int? ActorId { get; set; }

    public AuditAction Action { get; set; }

    /// <summary>The article acted on, for the article actions.</summary>
    public int? ArticleId { get; set; }

    /// <summary>The article's title at the time, so the entry reads the same after a rename or a purge.</summary>
    public string? ArticleTitle { get; set; }

    /// <summary>The user acted on, for <see cref="AuditAction.UserRoleChanged"/> and the scholar actions.</summary>
    public int? TargetUserId { get; set; }

    /// <summary>The value before the change (a status or a role name); null when the action has none.</summary>
    public string? FromValue { get; set; }

    /// <summary>The value after the change (a status or a role name); null when the action has none.</summary>
    public string? ToValue { get; set; }
}
