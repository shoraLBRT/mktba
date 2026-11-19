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

    // AI styling
    public static AppError AiTextRequired => new("ai_text_required", "Text is required.");
    public static AppError AiSettingsIncomplete => new("ai_settings_incomplete", "BaseUrl and model are required.");
    public static AppError AiDisabled => new("ai_disabled", "AI styling is disabled in the settings.");
    public static AppError AiProviderNotConfigured => new("ai_provider_not_configured", "AI provider is not configured: base URL, model and API key are required.");
    public static AppError AiProviderEmptyResponse => new("ai_provider_empty_response", "AI provider returned empty content.");

    public static AppError AiProviderRequestFailed(int status, string providerMessage) =>
        new("ai_provider_request_failed", $"AI provider request failed ({status}): {providerMessage}", With(("status", status)));

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

    public static AppError ArticleBulkTooMany(int max) =>
        new("article_bulk_too_many", $"A bulk action takes at most {max} articles.", With(("max", max)));

    public static AppError LocaleUnsupported(string locale) =>
        new("locale_unsupported", $"Locale '{locale}' is not supported. Supported: {string.Join(", ", Domain.Entities.Locales.Supported)}.",
            With(("locale", locale), ("supported", string.Join(", ", Domain.Entities.Locales.Supported))));

    public static AppError SearchQueryTooShort(int minLength) =>
        new("search_query_too_short", $"A search query must be at least {minLength} characters long.", With(("minLength", minLength)));

    public static AppError SearchQueryTooLong(int maxLength) =>
        new("search_query_too_long", $"A search query cannot be longer than {maxLength} characters.", With(("maxLength", maxLength)));

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

    public static AppError ArticleMoveCycle =>
        new("article_move_cycle", "An article cannot be moved under itself or one of its descendants.");

    public static AppError ArticleParentNotFound(int parentId) =>
        new("article_parent_not_found", $"Parent article with id {parentId} does not exist.", With(("parentId", parentId)));

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

    public static AppError SchoolSlugTaken(string slug) =>
        new("school_slug_taken", $"School with slug '{slug}' already exists.", With(("slug", slug)));

    private static IReadOnlyDictionary<string, object?> With(params (string Key, object? Value)[] values) =>
        values.ToDictionary(value => value.Key, value => value.Value);
}
