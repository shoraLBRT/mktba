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
/// <param name="IsLatestRevision">
/// True while the reviewed revision is still the article's latest. Whether a later edit makes the mark
/// «for a previous version» is V-05 (#121), which decides what counts as a substantial edit.
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
    bool IsLatestRevision);

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
public sealed record ArticleReviewMarkDto(int RevisionNumber, ArticleReviewVerdict Verdict, DateTime UpdatedAt);

/// <summary>One published article a scholar may review.</summary>
/// <param name="LatestRevisionNumber">The revision a review would be about.</param>
/// <param name="MyLatestReview">The caller's review of the newest revision they reviewed; null when they have not reviewed the article.</param>
public sealed record ArticleReviewArticleDto(
    int ArticleId,
    string Title,
    string Slug,
    string Locale,
    int LatestRevisionNumber,
    DateTime UpdatedAt,
    ArticleReviewMarkDto? MyLatestReview);

/// <summary>A page of the articles a scholar may review, the latest edited first.</summary>
public sealed record ArticleReviewArticlePageDto(IReadOnlyList<ArticleReviewArticleDto> Items, int Total, int Page, int PageSize);

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
/// <param name="IsLatestRevision">
/// False when the article was edited after the reviewed revision: readers see the mark as «для
/// предыдущей версии» (D5). Which edits are substantial is V-05 (#121); until then any later revision counts.
/// </param>
public sealed record ArticleVerificationMarkDto(
    string? ScholarName,
    string? ScholarSlug,
    ArticleReviewVerdict Verdict,
    string? Mazhab,
    int RevisionNumber,
    DateTime ReviewedAt,
    bool IsLatestRevision);
