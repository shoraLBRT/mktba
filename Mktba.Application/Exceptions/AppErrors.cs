namespace Mktba.Application.Exceptions;

/// <summary>
/// The catalog of API error codes. Every code here has a Russian translation in
/// mktba.react/src/localization/locales/ru/shared.json (section "apiErrors").
/// </summary>
public static class AppErrors
{
    // Generic
    public static AppError BadRequest => new("bad_request", "The request could not be read.");
    public static AppError Unauthorized => new("unauthorized", "Authentication is required.");
    public static AppError Forbidden => new("forbidden", "You do not have permission to perform this action.");
    public static AppError TooManyRequests => new("too_many_requests", "Too many requests. Try again later.");
    public static AppError InternalError => new("internal_error", "Internal server error.");

    // Auth
    public static AppError EmailAndPasswordRequired => new("email_and_password_required", "Email and password are required.");
    public static AppError InvalidCredentials => new("invalid_credentials", "Invalid credentials.");
    public static AppError AdminAlreadyExists => new("admin_already_exists", "Admin with this email already exists.");
    public static AppError PasswordTooShort(int minLength) =>
        new("password_too_short", $"The password must be at least {minLength} characters long.", With(("minLength", minLength)));

    public static AppError PasswordTooLong(int maxLength) =>
        new("password_too_long", $"The password cannot be longer than {maxLength} characters.", With(("maxLength", maxLength)));

    public static AppError PasswordTooSimple => new("password_too_simple", "The password is too simple: it repeats the email or one character.");

    public static AppError InviteNotFound => new("invite_not_found", "Invite not found. Check the code you were given.");
    public static AppError InviteExpired => new("invite_expired", "The invite has expired.");
    public static AppError InviteUsed => new("invite_used", "The invite has already been used.");
    public static AppError InviteRevoked => new("invite_revoked", "The invite has been revoked.");

    public static AppError InviteLifetimeInvalid(int maxHours) =>
        new("invite_lifetime_invalid", $"Invite lifetime must be from 1 to {maxHours} hours.", With(("maxHours", maxHours)));

    public static AppError InviteNoteTooLong(int maxLength) =>
        new("invite_note_too_long", $"Invite note cannot be longer than {maxLength} characters.", With(("maxLength", maxLength)));

    // Users
    public static AppError RoleInvalid => new("role_invalid", "Unknown role.");
    public static AppError LastAdminDemotion => new("last_admin_demotion", "The last admin cannot be given another role.");
    public static AppError SessionInvalid => new("session_invalid", "The session has ended. Sign in again.");
    public static AppError SessionNotFound => new("session_not_found", "Session not found.");
    public static AppError SessionCsrfHeaderMissing => new("session_csrf_header_missing", "The request must carry the X-Requested-With header.");

    // User profile (U-07)
    public static AppError AuthorNotFound => new("author_not_found", "There is no such author page.");
    public static AppError ProfileDisplayNameRequired => new("profile_display_name_required", "A profile address needs a display name.");

    public static AppError ProfileDisplayNameInvalid(int maxLength) =>
        new("profile_display_name_invalid", $"Display name must be one line of at most {maxLength} characters.", With(("maxLength", maxLength)));

    public static AppError ProfileSlugInvalid => new(
        "profile_slug_invalid",
        $"Profile address must be 1-{Services.ArticleSlugRules.MaxLength} characters of a-z, 0-9 and single hyphens, and not digits only.",
        With(("maxLength", Services.ArticleSlugRules.MaxLength)));

    public static AppError ProfileSlugTaken(string slug) =>
        new("profile_slug_taken", $"Profile address '{slug}' is already used by another user.", With(("slug", slug)));

    public static AppError ProfileAvatarUrlInvalid =>
        new("profile_avatar_url_invalid", "Avatar must be an absolute http(s) URL or a site-relative path.");

    public static AppError ProfileBioTooLong(int maxLength) =>
        new("profile_bio_too_long", $"The text about you must be at most {maxLength} characters.", With(("maxLength", maxLength)));

    public static AppError ProfileDegreeTooLong(int maxLength) =>
        new("profile_degree_too_long", $"Degree must be at most {maxLength} characters.", With(("maxLength", maxLength)));

    public static AppError ProfileInstitutionTooLong(int maxLength) =>
        new("profile_institution_too_long", $"Institution must be at most {maxLength} characters.", With(("maxLength", maxLength)));

    public static AppError ProfileLinksTooMany(int max) =>
        new("profile_links_too_many", $"A profile holds at most {max} links.", With(("max", max)));

    public static AppError ProfileLinkLabelInvalid(int maxLength) =>
        new("profile_link_label_invalid", $"Every link needs a label of at most {maxLength} characters.", With(("maxLength", maxLength)));

    public static AppError ProfileLinkUrlInvalid =>
        new("profile_link_url_invalid", "A link must be an absolute http(s) URL.");

    // AI styling
    public static AppError AiTextRequired => new("ai_text_required", "Text is required.");
    public static AppError AiSettingsIncomplete => new("ai_settings_incomplete", "BaseUrl and model are required.");
    public static AppError AiDisabled => new("ai_disabled", "AI styling is disabled in the settings.");
    public static AppError AiProviderNotConfigured => new("ai_provider_not_configured", "AI provider is not configured: base URL, model and API key are required.");
    public static AppError AiProviderEmptyResponse => new("ai_provider_empty_response", "AI provider returned empty content.");

    public static AppError AiProviderRequestFailed(int status, string providerMessage) =>
        new("ai_provider_request_failed", $"AI provider request failed ({status}): {providerMessage}", With(("status", status)));

    // Search engines
    public static AppError IndexNowNotConfigured => new("indexnow_not_configured", "IndexNow is not configured on this site.");

    // Articles
    public static AppError ArticleNotFound => new("article_not_found", "Article not found.");
    public static AppError ArticleGone => new("article_gone", "The article has been removed.");
    public static AppError ArticleTitleRequired => new("article_title_required", "Title is required.");
    public static AppError ArticleIdMismatch => new("article_id_mismatch", "Article id in the body does not match the route.");
    public static AppError ArticleContentUpdateFailed => new("article_content_update_failed", "Error occurred while updating content.");
    public static AppError ArticleParagraphsRequired => new("article_paragraphs_required", "At least one paragraph is required.");
    public static AppError ArticleParagraphOrderInvalid => new("article_paragraph_order_invalid", "Paragraph order must be >= 1.");
    public static AppError ArticleParagraphOrderNotContiguous =>
        new("article_paragraph_order_not_contiguous", "Paragraph order values must form a contiguous sequence from 1 to N.");
    public static AppError ArticleParagraphForeign => new("article_paragraph_foreign", "Some paragraph ids do not belong to this article.");
    public static AppError ArticleRelatedLinkSelf => new("article_related_link_self", "An article cannot link to itself.");

    public static AppError ArticleSlugInvalid => new(
        "article_slug_invalid",
        $"Slug must be 1-{Services.ArticleSlugRules.MaxLength} characters of a-z, 0-9 and single hyphens, and not digits only.",
        With(("maxLength", Services.ArticleSlugRules.MaxLength)));

    public static AppError ArticleSeoTitleTooLong => new(
        "article_seo_title_too_long",
        $"SEO title must be at most {Infrastructure.Data.MktbaDbContext.SeoTitleMaxLength} characters.",
        With(("maxLength", Infrastructure.Data.MktbaDbContext.SeoTitleMaxLength)));

    public static AppError ArticleSeoDescriptionTooLong => new(
        "article_seo_description_too_long",
        $"SEO description must be at most {Infrastructure.Data.MktbaDbContext.SeoDescriptionMaxLength} characters.",
        With(("maxLength", Infrastructure.Data.MktbaDbContext.SeoDescriptionMaxLength)));

    public static AppError ArticleSocialImageUrlInvalid => new(
        "article_social_image_url_invalid",
        $"Social image must be an absolute http(s) URL or a path starting with '/', at most {Infrastructure.Data.MktbaDbContext.SocialImageUrlMaxLength} characters.",
        With(("maxLength", Infrastructure.Data.MktbaDbContext.SocialImageUrlMaxLength)));

    public static AppError ArticleStatusTransitionInvalid(Domain.Entities.ArticleStatus from, Domain.Entities.ArticleStatus to) =>
        new("article_status_transition_invalid", $"An article cannot move from {from} to {to}.",
            With(("from", from.ToString()), ("to", to.ToString())));

    public static AppError ArticleStatusCommentTooLong => new(
        "article_status_comment_too_long",
        $"A status change comment must be at most {Infrastructure.Data.MktbaDbContext.StatusChangeCommentMaxLength} characters.",
        With(("maxLength", Infrastructure.Data.MktbaDbContext.StatusChangeCommentMaxLength)));

    public static AppError ArticleBulkTooMany(int max) =>
        new("article_bulk_too_many", $"A bulk action takes at most {max} articles.", With(("max", max)));

    public static AppError LocaleUnsupported(string locale) =>
        new("locale_unsupported", $"Locale '{locale}' is not supported. Supported: {string.Join(", ", Domain.Entities.Locales.Supported)}.",
            With(("locale", locale), ("supported", string.Join(", ", Domain.Entities.Locales.Supported))));

    public static AppError SearchQueryTooShort(int minLength) =>
        new("search_query_too_short", $"A search query must be at least {minLength} characters long.", With(("minLength", minLength)));

    public static AppError SearchQueryTooLong(int maxLength) =>
        new("search_query_too_long", $"A search query cannot be longer than {maxLength} characters.", With(("maxLength", maxLength)));

    public static AppError ArticleSlugReserved(string slug) =>
        new("article_slug_reserved", $"Slug '{slug}' is reserved for another page of the site.", With(("slug", slug)));

    public static AppError ArticleSlugTaken(string slug) =>
        new("article_slug_taken", $"Slug '{slug}' is already used by another article.", With(("slug", slug)));

    public static AppError ArticleSlotOpinionsRequired(int order) =>
        new("article_slot_opinions_required", $"Slot at order {order} must have at least one opinion.", With(("order", order)));

    public static AppError ArticleSlotDefaultOpinionRequired(int order) =>
        new("article_slot_default_opinion_required", $"Each slot must have exactly one default opinion (slot order {order}).", With(("order", order)));

    public static AppError RevisionNotFound(int number) =>
        new("revision_not_found", $"Revision {number} of this article was not found.", With(("number", number)));

    public static AppError RevisionCommentTooLong => new(
        "revision_comment_too_long",
        $"Edit comment must be at most {Infrastructure.Data.MktbaDbContext.RevisionCommentMaxLength} characters.",
        With(("maxLength", Infrastructure.Data.MktbaDbContext.RevisionCommentMaxLength)));

    public static AppError ArticleDraftSnapshotInvalid =>
        new("article_draft_snapshot_invalid", "A draft snapshot must be a JSON object.");

    public static AppError ArticleDraftTooLarge(int maxLength) =>
        new("article_draft_too_large", $"A draft snapshot cannot be longer than {maxLength} characters.", With(("maxLength", maxLength)));

    public static AppError ArticleMoveCycle =>
        new("article_move_cycle", "An article cannot be moved under itself or one of its descendants.");

    public static AppError ArticleParentNotFound(int parentId) =>
        new("article_parent_not_found", $"Parent article with id {parentId} does not exist.", With(("parentId", parentId)));

    public static AppError ArticleTranslationSourceNotFound(int articleId) =>
        new("article_translation_source_not_found", $"Article with id {articleId} to translate does not exist.", With(("articleId", articleId)));

    public static AppError ArticleTranslationExists(string locale) =>
        new("article_translation_exists", $"The article already has a version in the language {locale}.", With(("locale", locale)));

    public static AppError ArticleTranslationRevisionInvalid =>
        new("article_translation_revision_invalid", "The translation can only match an existing revision of the article it was translated from.");

    public static AppError ArticleHasChildren =>
        new("article_has_children", "An article with child articles cannot be moved to the trash; move or trash the children first.");

    public static AppError ArticleNotInTrash => new("article_not_in_trash", "No such article in the trash.");

    public static AppError ArticleParentInTrash =>
        new("article_parent_in_trash", "The article's parent is in the trash; restore the parent first.");

    public static AppError ArticleCoAuthorIsAuthor =>
        new("article_coauthor_is_author", "The article's author cannot also be its co-author.");

    public static AppError UserNotFound(int userId) =>
        new("user_not_found", $"User with id {userId} does not exist.", With(("userId", userId)));

    public static AppError RelatedArticleNotFound(int articleId) =>
        new("related_article_not_found", $"Related article with id {articleId} does not exist.", With(("articleId", articleId)));

    // Infobox
    public static AppError InfoboxFieldOrderInvalid => new("infobox_field_order_invalid", "Infobox field order must be >= 1.");
    public static AppError InfoboxFieldOrderNotContiguous =>
        new("infobox_field_order_not_contiguous", "Infobox field order must form a contiguous sequence from 1 to N.");
    public static AppError InfoboxFieldKeyRequired => new("infobox_field_key_required", "Each infobox field must contain a key.");
    public static AppError InfoboxFieldLabelRequired => new("infobox_field_label_required", "Each infobox field must contain a label.");
    public static AppError InfoboxFieldValueRequired => new("infobox_field_value_required", "Each infobox field must contain a value.");

    // Paragraphs
    public static AppError ParagraphNotFound => new("paragraph_not_found", "Paragraph not found.");
    public static AppError ParagraphOrderInvalid => new("paragraph_order_invalid", "Order must be greater than or equal to 1.");
    public static AppError ParagraphOpinionsRequired => new("paragraph_opinions_required", "At least one opinion is required.");
    public static AppError ParagraphDefaultOpinionRequired =>
        new("paragraph_default_opinion_required", "Exactly one opinion must be marked as default.");
    public static AppError ParagraphPlainSchoolsNotAllowed =>
        new("paragraph_plain_schools_not_allowed", "A paragraph with a single opinion is common to all schools and cannot be linked to schools.");

    public static AppError ParagraphOrderTooLarge(int maxOrder) =>
        new("paragraph_order_too_large", $"Order cannot be greater than {maxOrder}.", With(("maxOrder", maxOrder)));

    // Schools
    public static AppError SchoolNotFound => new("school_not_found", "School not found.");
    public static AppError SchoolSlugRequired => new("school_slug_required", "Slug is required.");
    public static AppError SchoolNameRequired => new("school_name_required", "Name is required.");
    public static AppError SchoolShortNameRequired => new("school_short_name_required", "ShortName is required.");
    public static AppError SystemSchoolDeleteForbidden => new("system_school_delete_forbidden", "System schools cannot be deleted.");
    public static AppError SystemSchoolUpdateForbidden => new("system_school_update_forbidden", "System schools cannot be changed.");

    /// <summary>M-08 (#116): a scholar opinion other articles use; only an admin may change or delete it.</summary>
    public static AppError SchoolInUse =>
        new("school_in_use", "Other articles use this scholar opinion; only an admin may change or delete it.");

    public static AppError SchoolScholarArticleNotFound =>
        new("school_scholar_article_not_found", "The article about the scholar was not found.");

    public static AppError SchoolFieldTooLong(string field, int maxLength) =>
        new("school_field_too_long", $"{field} cannot be longer than {maxLength} characters.", With(("field", field), ("maxLength", maxLength)));

    public static AppError SchoolSlugTaken(string slug) =>
        new("school_slug_taken", $"School with slug '{slug}' already exists.", With(("slug", slug)));

    // Sources
    public static AppError SourceTitleRequired => new("source_title_required", "Source title is required.");
    public static AppError SourceKindInvalid => new("source_kind_invalid", "Unknown source kind.");
    public static AppError SourceUrlInvalid => new("source_url_invalid", "Source URL must be an absolute http or https URL.");

    public static AppError SourceNotFound(int id) =>
        new("source_not_found", $"Source {id} not found.", With(("id", id)));

    public static AppError SourceFieldTooLong(string field, int maxLength) =>
        new("source_field_too_long", $"Source {field} cannot be longer than {maxLength} characters.", With(("field", field), ("maxLength", maxLength)));

    public static AppError SourceDuplicate(int id) =>
        new("source_duplicate", $"The same source already exists (id {id}).", With(("id", id)));

    public static AppError SourceInUse(int count) =>
        new("source_in_use", $"The source is cited {count} time(s) and cannot be deleted.", With(("count", count)));

    public static AppError SourceLocatorTooLong(int maxLength) =>
        new("source_locator_too_long", $"A source locator cannot be longer than {maxLength} characters.", With(("maxLength", maxLength)));

    // Tags
    public static AppError TagNotFound => new("tag_not_found", "Tag not found.");

    public static AppError TagNameRequired => new("tag_name_required", "Tag name is required.");

    public static AppError TagNameInvalid => new("tag_name_invalid", "A tag name cannot contain a comma or control characters.");

    public static AppError TagNameTooLong(int maxLength) =>
        new("tag_name_too_long", $"A tag name cannot be longer than {maxLength} characters.", With(("maxLength", maxLength)));

    public static AppError ArticleTooManyTags(int max) =>
        new("article_too_many_tags", $"An article cannot have more than {max} tags.", With(("max", max)));

    public static AppError TagNameTaken(int id) =>
        new("tag_name_taken", $"Another tag of this language has this name (id {id}); merge them instead.", With(("id", id)));

    public static AppError TagSlugInvalid => new(
        "tag_slug_invalid", "Tag slug must be 1-80 characters of lowercase Latin letters, digits and single hyphens, not only digits.");

    public static AppError TagSlugTaken(string slug) =>
        new("tag_slug_taken", $"Another tag of this language has the slug '{slug}'.", With(("slug", slug)));

    public static AppError TagMergeIntoItself => new("tag_merge_into_itself", "A tag cannot be merged into itself.");

    public static AppError TagMergeLocaleMismatch => new("tag_merge_locale_mismatch", "Only tags of the same language can be merged.");

    // Feedback
    public static AppError FeedbackTypeInvalid => new("feedback_type_invalid", "Feedback type is required: ArticleError, SiteProblem or Idea.");
    public static AppError FeedbackTextRequired => new("feedback_text_required", "Feedback text is required.");

    public static AppError FeedbackTextTooLong(int maxLength) =>
        new("feedback_text_too_long", $"Feedback text cannot be longer than {maxLength} characters.", With(("maxLength", maxLength)));

    public static AppError FeedbackContactTooLong(int maxLength) =>
        new("feedback_contact_too_long", $"Feedback contact cannot be longer than {maxLength} characters.", With(("maxLength", maxLength)));

    public static AppError FeedbackPageUrlInvalid(int maxLength) =>
        new("feedback_page_url_invalid", $"Page URL must be an absolute http(s) URL or a site-relative path of at most {maxLength} characters.", With(("maxLength", maxLength)));

    public static AppError FeedbackLimitReached =>
        new("feedback_limit_reached", "Too many feedback messages were received lately. Try again later.");

    // Analytics events (N-02)
    public static AppError AnalyticsEventsRequired => new("analytics_events_required", "Send at least one event.");

    public static AppError AnalyticsTooManyEvents(int maxCount) =>
        new("analytics_too_many_events", $"At most {maxCount} events can be sent at once.", With(("maxCount", maxCount)));

    // Analytics periods (N-08)
    public static AppError AnalyticsPeriodInvalid =>
        new("analytics_period_invalid", "The period's first day (from) cannot be after its last day (to).");

    public static AppError AnalyticsPeriodTooLong(int maxDays) =>
        new("analytics_period_too_long", $"A period can be at most {maxDays} days long.", With(("maxDays", maxDays)));

    // Uploads (U-08)
    public static AppError UploadFileRequired => new("upload_file_required", "Attach the file as the form field 'file'.");

    public static AppError UploadTooLarge(int maxMegabytes) =>
        new("upload_too_large", $"The file cannot be larger than {maxMegabytes} MB.", With(("maxMegabytes", maxMegabytes)));

    public static AppError UploadTypeUnsupported =>
        new("upload_type_unsupported", "Only JPEG, PNG and WebP images can be uploaded.");

    public static AppError FileNotFound => new("file_not_found", "There is no such file.");

    public static AppError UploadImageInvalid => new("upload_image_invalid", "The image could not be read.");

    public static AppError UploadImageTooManyPixels(int maxMegapixels) =>
        new("upload_image_too_many_pixels", $"The image cannot have more than {maxMegapixels} megapixels.", With(("maxMegapixels", maxMegapixels)));

    // Scholar applications (V-01)
    public static AppError ScholarApplicationDegreeRequired => new("scholar_application_degree_required", "Enter your degree or title.");

    public static AppError ScholarApplicationDegreeTooLong(int maxLength) =>
        new("scholar_application_degree_too_long", $"Degree must be at most {maxLength} characters.", With(("maxLength", maxLength)));

    public static AppError ScholarApplicationInstitutionRequired =>
        new("scholar_application_institution_required", "Enter the institution.");

    public static AppError ScholarApplicationInstitutionTooLong(int maxLength) =>
        new("scholar_application_institution_too_long", $"Institution must be at most {maxLength} characters.", With(("maxLength", maxLength)));

    public static AppError ScholarApplicationSpecializationRequired =>
        new("scholar_application_specialization_required", "Enter your specialization.");

    public static AppError ScholarApplicationSpecializationTooLong(int maxLength) =>
        new("scholar_application_specialization_too_long", $"Specialization must be at most {maxLength} characters.", With(("maxLength", maxLength)));

    public static AppError ScholarApplicationMazhabInvalid =>
        new("scholar_application_mazhab_invalid", "The madhab must be one of the four canonical schools, or none.");

    public static AppError ScholarApplicationDocumentsRequired =>
        new("scholar_application_documents_required", "Attach at least one document that confirms your degree.");

    public static AppError ScholarApplicationDocumentsTooMany(int max) =>
        new("scholar_application_documents_too_many", $"An application holds at most {max} documents.", With(("max", max)));

    public static AppError ScholarDocumentTypeUnsupported =>
        new("scholar_document_type_unsupported", "Only PDF, JPEG, PNG and WebP documents can be attached.");

    public static AppError ScholarDocumentPdfInvalid => new("scholar_document_pdf_invalid", "The PDF file is damaged or incomplete.");

    public static AppError ScholarApplicationAlreadyPending =>
        new("scholar_application_already_pending", "You already have an application waiting for review.");

    public static AppError ScholarApplicationRoleNotAllowed =>
        new("scholar_application_role_not_allowed", "Scholars and admins do not apply for the scholar status.");

    public static AppError ScholarApplicationNotFound => new("scholar_application_not_found", "There is no such application.");

    public static AppError ScholarDocumentNotFound => new("scholar_document_not_found", "There is no such document.");

    // Review of scholar applications (V-02)
    public static AppError ScholarApplicationNotPending =>
        new("scholar_application_not_pending", "The application is no longer waiting for review.");

    public static AppError ScholarApplicationNotApproved =>
        new("scholar_application_not_approved", "Only an approved application's scholar status can be revoked.");

    public static AppError ScholarApplicantRoleChanged =>
        new("scholar_applicant_role_changed", "The applicant's role has changed since the application: change it on the users page instead.");

    public static AppError ScholarDecisionReasonRequired =>
        new("scholar_decision_reason_required", "Give the reason; the applicant will see it.");

    public static AppError ScholarDecisionReasonTooLong(int maxLength) =>
        new("scholar_decision_reason_too_long", $"The reason must be at most {maxLength} characters.", With(("maxLength", maxLength)));

    private static IReadOnlyDictionary<string, object?> With(params (string Key, object? Value)[] values) =>
        values.ToDictionary(value => value.Key, value => value.Value);
}
