namespace Mktba.Domain.Entities;

/// <summary>What a notification is about (V-09, #125). Stored by name.</summary>
public enum NotificationType
{
    /// <summary>The recipient's scholar application was approved: they are a scholar now.</summary>
    ScholarApplicationApproved = 1,

    /// <summary>The recipient's scholar application was refused (the reason is on the application page).</summary>
    ScholarApplicationRejected = 2,

    /// <summary>The scholar status of the recipient was taken back (the reason is on the application page).</summary>
    ScholarStatusRevoked = 3,

    /// <summary>A scholar gave a verdict on an article the recipient wrote or co-authors.</summary>
    ArticleReviewed = 4,

    /// <summary>A substantial edit made the recipient's mark on an article stale: a re-review request.</summary>
    ReReviewRequested = 5,

    /// <summary>A scholar made a remark on a block of the recipient's article.</summary>
    RemarkCreated = 6,

    /// <summary>A new message in a remark thread the recipient takes part in.</summary>
    RemarkReplied = 7,

    /// <summary>A remark of the recipient was closed (fixed or without a change).</summary>
    RemarkClosed = 8,

    /// <summary>A closed remark the recipient takes part in was reopened.</summary>
    RemarkReopened = 9,
}

/// <summary>
/// Which notifications may also go by email; the in-app list always gets them all (V-09, #125).
/// </summary>
public enum NotificationCategory
{
    /// <summary>Decisions on the user's scholar application.</summary>
    ScholarApplication = 1,

    /// <summary>Verdicts on the user's articles and re-review requests to a scholar.</summary>
    ArticleReviews = 2,

    /// <summary>Remark threads: new remarks, replies, closing and reopening.</summary>
    Remarks = 3,
}

/// <summary>
/// One in-app notification of one user (V-09, #125). The row keeps what the list shows — the type,
/// the article's title as it was, the actor, a short excerpt — and the site-relative link to the page
/// the notification is about, so it reads the same when the article is renamed or gone.
/// </summary>
public class Notification
{
    /// <summary>The longest article title kept with a notification.</summary>
    public const int ArticleTitleMaxLength = 300;

    /// <summary>The longest excerpt of a remark message kept (in-app only, never in an email).</summary>
    public const int ExcerptMaxLength = 200;

    /// <summary>The longest link kept.</summary>
    public const int LinkMaxLength = 300;

    public int Id { get; set; }

    /// <summary>The recipient; their notifications go with them.</summary>
    public int UserId { get; set; }

    public User User { get; set; } = null!;

    public NotificationType Type { get; set; }

    /// <summary>Who did what the notification tells of; null for no one in particular or a deleted user.</summary>
    public int? ActorId { get; set; }

    public User? Actor { get; set; }

    /// <summary>The article it is about; set to null when the article is deleted.</summary>
    public int? ArticleId { get; set; }

    /// <summary>The article's title when the notification was made.</summary>
    public string? ArticleTitle { get; set; }

    /// <summary>The remark it is about; set to null when the remark is deleted.</summary>
    public int? RemarkId { get; set; }

    public ArticleRemark? Remark { get; set; }

    /// <summary>The verdict of <see cref="NotificationType.ArticleReviewed"/>.</summary>
    public ArticleReviewVerdict? Verdict { get; set; }

    /// <summary>The outcome of <see cref="NotificationType.RemarkClosed"/>.</summary>
    public ArticleRemarkStatus? RemarkStatus { get; set; }

    /// <summary>The start of the message of a remark notification, as plain text; never sent by email.</summary>
    public string? Excerpt { get; set; }

    /// <summary>Site-relative path of the page the notification leads to, e.g. <c>/admin/scholar-application</c>.</summary>
    public string Link { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    /// <summary>When the recipient read it; null while unread.</summary>
    public DateTime? ReadAt { get; set; }

    /// <summary>The email of this notification, when one is to be sent.</summary>
    public NotificationEmail? Email { get; set; }

    /// <summary>The category whose email setting decides whether this type goes by email.</summary>
    public static NotificationCategory CategoryOf(NotificationType type) => type switch
    {
        NotificationType.ScholarApplicationApproved
            or NotificationType.ScholarApplicationRejected
            or NotificationType.ScholarStatusRevoked => NotificationCategory.ScholarApplication,
        NotificationType.ArticleReviewed or NotificationType.ReReviewRequested => NotificationCategory.ArticleReviews,
        _ => NotificationCategory.Remarks,
    };
}

/// <summary>Where the email of a notification stands. Stored by name.</summary>
public enum EmailDeliveryState
{
    /// <summary>Waiting for its (next) attempt.</summary>
    Pending = 1,

    /// <summary>Handed to the mail server (or, without one, written to the log).</summary>
    Sent = 2,

    /// <summary>Rejected for good, or out of attempts; never tried again.</summary>
    Failed = 3,
}

/// <summary>
/// The outbox row of one notification's email (V-09, #125): the table is the queue, so pending emails
/// survive a restart. <see cref="Attempts"/> is a concurrency token — an attempt starts by incrementing
/// it — so two workers cannot take one row (as <see cref="FeedbackMessage"/>). The address, subject
/// and text are built at send time from the notification and the recipient's current address.
/// </summary>
public class NotificationEmail
{
    /// <summary>The longest error kept (the server's status and message; never the email's text).</summary>
    public const int LastErrorMaxLength = 500;

    public int Id { get; set; }

    public int NotificationId { get; set; }

    public Notification Notification { get; set; } = null!;

    public EmailDeliveryState State { get; set; } = EmailDeliveryState.Pending;

    public int Attempts { get; set; }

    public DateTime NextAttemptAt { get; set; }

    public DateTime? LastAttemptAt { get; set; }

    public DateTime? SentAt { get; set; }

    public string? LastError { get; set; }
}

/// <summary>
/// A user's email choices (V-09, #125; P-05, #93). No row means the defaults: every category by email.
/// In-app notifications are always on.
/// </summary>
public class UserNotificationSettings
{
    public int UserId { get; set; }

    public User User { get; set; } = null!;

    public bool EmailScholarApplication { get; set; } = true;

    public bool EmailArticleReviews { get; set; } = true;

    public bool EmailRemarks { get; set; } = true;

    public bool EmailsFor(NotificationCategory category) => category switch
    {
        NotificationCategory.ScholarApplication => EmailScholarApplication,
        NotificationCategory.ArticleReviews => EmailArticleReviews,
        _ => EmailRemarks,
    };
}
