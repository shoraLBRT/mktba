namespace Mktba.Domain.Entities;

/// <summary>
/// A user's application for the scholar status (V-01, #117): what they say of themselves and the
/// documents that back it. An admin reviews it (V-02, #118); until then it is
/// <see cref="ScholarApplicationStatus.Pending"/>, and a user has at most one pending application.
/// <see cref="Status"/> is a concurrency token, so two decisions (or a decision and a withdrawal)
/// racing each other cannot both be stored.
/// </summary>
public class ScholarApplication
{
    public const int DegreeMaxLength = 150;
    public const int InstitutionMaxLength = 200;
    public const int SpecializationMaxLength = 200;
    public const int MazhabMaxLength = 32;

    /// <summary>The longest reason an admin gives for a refusal or a revocation (V-02, #118).</summary>
    public const int ReasonMaxLength = 1000;

    /// <summary>The most documents one application holds.</summary>
    public const int MaxDocuments = 5;

    public int Id { get; set; }

    public int UserId { get; set; }

    public User User { get; set; } = null!;

    /// <summary>The academic degree or title, as the applicant writes it.</summary>
    public string Degree { get; set; } = string.Empty;

    /// <summary>Where it was obtained or where the applicant teaches.</summary>
    public string Institution { get; set; } = string.Empty;

    /// <summary>The field of knowledge (fiqh, hadith, aqidah…), as the applicant writes it.</summary>
    public string Specialization { get; set; } = string.Empty;

    /// <summary>The slug of the canonical school the applicant follows; null when they named none.</summary>
    public string? Mazhab { get; set; }

    public ScholarApplicationStatus Status { get; set; }

    public DateTime SubmittedAt { get; set; }

    /// <summary>When it stopped being pending (withdrawn or decided); null while it is pending.</summary>
    public DateTime? ClosedAt { get; set; }

    /// <summary>
    /// The admin's reason for a refusal or a revocation (V-02, #118), shown to the applicant; plain
    /// text. Null while pending, after a withdrawal and for an approval.
    /// </summary>
    public string? DecisionReason { get; set; }

    /// <summary>
    /// The role the applicant had when the application was approved (V-02, #118): the role a
    /// revocation gives back. Null unless the application was approved.
    /// </summary>
    public UserRole? RoleBeforeApproval { get; set; }

    /// <summary>When the scholar status it granted was revoked; null otherwise.</summary>
    public DateTime? RevokedAt { get; set; }

    public List<ScholarApplicationDocument> Documents { get; set; } = [];
}

/// <summary>Where an application stands.</summary>
public enum ScholarApplicationStatus
{
    /// <summary>Submitted and waiting for an admin.</summary>
    Pending = 1,

    /// <summary>An admin confirmed it (V-02, #118).</summary>
    Approved = 2,

    /// <summary>An admin refused it (V-02, #118).</summary>
    Rejected = 3,

    /// <summary>The applicant took it back before a decision; its documents are deleted then.</summary>
    Withdrawn = 4,

    /// <summary>
    /// It was approved, and an admin later took the scholar status back (V-02, #118); its documents
    /// are deleted then.
    /// </summary>
    Revoked = 5,
}

/// <summary>One document of an application: the stored file and the name the applicant's file had.</summary>
public class ScholarApplicationDocument
{
    public const int FileNameMaxLength = 200;

    public int Id { get; set; }

    public int ApplicationId { get; set; }

    public ScholarApplication Application { get; set; } = null!;

    /// <summary>The position among the application's documents, from 0.</summary>
    public int Order { get; set; }

    public int StoredFileId { get; set; }

    public StoredFile StoredFile { get; set; } = null!;

    /// <summary>
    /// The name of the uploaded file, shown to the applicant and the admin only and given back on
    /// download; nothing of it reaches the storage name.
    /// </summary>
    public string FileName { get; set; } = string.Empty;
}
