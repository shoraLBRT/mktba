using Mktba.Domain.Entities;

namespace Mktba.Application.DTOs;

/// <summary>A scholar's verdict on one revision (V-03, #119).</summary>
/// <param name="RevisionNumber">The revision the verdict is about (D5, #115: the mark belongs to a revision).</param>
/// <param name="Mazhab">
/// The scope: the slug of the canonical school whose readers' version the scholar reviewed; null when
/// the review covers the whole article.
/// </param>
/// <param name="CreatedAt">When the scholar first reviewed this revision (UTC).</param>
/// <param name="UpdatedAt">When the verdict was last given; later than <paramref name="CreatedAt"/> after a replacement.</param>
/// <param name="IsLatestRevision">True while the reviewed revision is still the article's latest.</param>
/// <param name="IsCurrent">
/// True while no substantial edit (V-05, #121: a change to the text the review's scope covers) was
/// saved after the reviewed revision; false makes the mark «для предыдущей версии» and asks the
/// scholar to review again (D5, #115). Always true with <paramref name="IsLatestRevision"/>.
/// </param>
public sealed record ArticleReviewDto(
    int Id,
    int ArticleId,
    int RevisionNumber,
    ArticleReviewVerdict Verdict,
    string? Comment,
    string? Mazhab,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    bool IsLatestRevision,
    bool IsCurrent);

/// <summary>The verdict a scholar gives (V-03, #119).</summary>
/// <param name="RevisionNumber">
/// The revision the scholar read; it must still be the article's latest, so an edit saved while they
/// were reading is never confirmed unseen.
/// </param>
/// <param name="Comment">Plain text; required for <see cref="ArticleReviewVerdict.ConfirmedWithRemarks"/> and <see cref="ArticleReviewVerdict.HasErrors"/>.</param>
public sealed record ArticleReviewCreateDto(int RevisionNumber, ArticleReviewVerdict Verdict, string? Comment);

/// <summary>What a scholar's review covers (V-03, #119).</summary>
/// <param name="Mazhab">The slug of the scholar's canonical school; null when the review covers the whole article.</param>
/// <param name="SchoolId">That school's id (the snapshot's opinions name schools by id); null with <paramref name="Mazhab"/>.</param>
public sealed record ArticleReviewScopeDto(string? Mazhab, int? SchoolId);

/// <summary>The revision under review with its snapshot.</summary>
public sealed record ArticleReviewRevisionDto(int Number, DateTime CreatedAt, ArticleSnapshotDto Snapshot);

/// <summary>
/// Everything the scholar's review page needs (V-03, #119): the article's latest revision, what the
/// review covers, whether the caller may give a verdict, and their own reviews of this article.
/// </summary>
/// <param name="CanReview">
/// True for a verified scholar: the Scholar role and an approved application. An admin passes the
/// endpoint's policy and sees the page, but gives no verdict.
/// </param>
/// <param name="MyReviews">The caller's reviews of this article, the newest revision first.</param>
public sealed record ArticleReviewContextDto(
    int ArticleId,
    string Title,
    string Slug,
    string Locale,
    ArticleReviewRevisionDto Revision,
    ArticleReviewScopeDto Scope,
    bool CanReview,
    IReadOnlyList<ArticleReviewDto> MyReviews);

/// <summary>The caller's latest review of an article, for the list.</summary>
/// <param name="IsCurrent">False when a substantial edit came after it: the article needs a re-review (V-05, #121).</param>
public sealed record ArticleReviewMarkDto(int RevisionNumber, ArticleReviewVerdict Verdict, DateTime UpdatedAt, bool IsCurrent);

/// <summary>One published article a scholar may review.</summary>
/// <param name="LatestRevisionNumber">The revision a review would be about.</param>
/// <param name="MyLatestReview">The caller's review of the newest revision they reviewed; null when they have not reviewed the article.</param>
/// <param name="MatchesSpecialization">
/// True when a word of the caller's specialization matches the title, a tag or a section above the
/// article (V-07, #123; <c>SpecializationMatcher</c>).
/// </param>
/// <param name="MatchesMazhab">True when the article has an opinion of the caller's madhab (V-07, #123).</param>
public sealed record ArticleReviewArticleDto(
    int ArticleId,
    string Title,
    string Slug,
    string Locale,
    int LatestRevisionNumber,
    DateTime UpdatedAt,
    ArticleReviewMarkDto? MyLatestReview,
    bool MatchesSpecialization,
    bool MatchesMazhab);

/// <summary>
/// A page of the scholar's queue (V-07, #123): the articles needing a re-review first (V-05, #121),
/// then those the caller has not reviewed — matching both their specialization and their madhab,
/// then the specialization, then the madhab, then the rest — then, unless only the queue is asked
/// for, those they reviewed; the latest edited first within each group.
/// </summary>
/// <param name="NeedsReReviewTotal">
/// How many published articles the caller's latest review of went stale after a substantial edit
/// (V-05, #121) — over all of them, whatever the title search.
/// </param>
/// <param name="Mazhab">The caller's madhab (their approved application's), which <see cref="ArticleReviewArticleDto.MatchesMazhab"/> is about; null without one.</param>
/// <param name="SpecializationKeywords">The words of the caller's specialization the queue matches articles by; empty when none is usable.</param>
public sealed record ArticleReviewArticlePageDto(
    IReadOnlyList<ArticleReviewArticleDto> Items,
    int Total,
    int Page,
    int PageSize,
    int NeedsReReviewTotal,
    string? Mazhab,
    IReadOnlyList<string> SpecializationKeywords);

/// <summary>One of a scholar's reviews, for their history (V-07, #123).</summary>
/// <param name="IsAvailable">True while the article is published, so its review page opens.</param>
/// <param name="LatestRevisionNumber">The article's latest revision now.</param>
/// <param name="IsCurrent">False when a substantial edit came after the reviewed revision (V-05, #121).</param>
public sealed record ScholarReviewHistoryItemDto(
    int ReviewId,
    int ArticleId,
    string Title,
    bool IsAvailable,
    int RevisionNumber,
    int LatestRevisionNumber,
    ArticleReviewVerdict Verdict,
    string? Comment,
    string? Mazhab,
    DateTime UpdatedAt,
    bool IsLatestRevision,
    bool IsCurrent);

/// <summary>A page of a scholar's reviews across articles, the latest given first (V-07, #123).</summary>
public sealed record ScholarReviewHistoryPageDto(IReadOnlyList<ScholarReviewHistoryItemDto> Items, int Total, int Page, int PageSize);

/// <summary>
/// The scholars' marks on an article as readers see them (V-04, #120): the latest mark of each
/// verified scholar, the newest revision first. No ids, no emails, no comments.
/// </summary>
/// <param name="LatestRevisionNumber">The article's latest revision; null when it has none (then there are no marks).</param>
/// <param name="Marks">One per scholar: their review of the newest revision they reviewed.</param>
public sealed record ArticleVerificationDto(int? LatestRevisionNumber, IReadOnlyList<ArticleVerificationMarkDto> Marks);

/// <summary>A scholar's latest mark on an article, for readers (V-04, #120).</summary>
/// <param name="ScholarName">The name from the scholar's profile (U-07); null while they have not set one — never an email.</param>
/// <param name="ScholarSlug">
/// The slug of the author page <c>/authors/{slug}</c> when it answers now (the scholar is credited on
/// a Published article); null otherwise, so the name is not a link.
/// </param>
/// <param name="Mazhab">The slug of the canonical school whose readers' version was reviewed; null for the whole article.</param>
/// <param name="RevisionNumber">The revision the mark belongs to (D5, #115).</param>
/// <param name="ReviewedAt">When the verdict was last given (UTC).</param>
/// <param name="IsLatestRevision">False when any revision was saved after the reviewed one.</param>
/// <param name="IsCurrent">
/// False when a substantial edit (V-05, #121: a change to the text the mark's scope covers) was saved
/// after the reviewed revision: readers see the mark as «для предыдущей версии» (D5, #115). An edit
/// of the tags, the summary, the slug, the SEO fields or the related links, or of whitespace only,
/// keeps the mark current.
/// </param>
public sealed record ArticleVerificationMarkDto(
    string? ScholarName,
    string? ScholarSlug,
    ArticleReviewVerdict Verdict,
    string? Mazhab,
    int RevisionNumber,
    DateTime ReviewedAt,
    bool IsLatestRevision,
    bool IsCurrent);
