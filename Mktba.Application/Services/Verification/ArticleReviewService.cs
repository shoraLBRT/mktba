using Microsoft.EntityFrameworkCore;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services.Verification;

/// <summary>
/// A scholar's review of an article (V-03, #119): the published articles to review, the latest
/// revision of one with what the review covers, and the verdict — «подтверждаю», «подтверждаю с
/// замечаниями» or «есть ошибки» — tied to that revision (D5, #115).
/// </summary>
/// <remarks>
/// <para>
/// Defaults chosen by the agent, open for the owner in #119. Who reviews: a verified scholar — the
/// <see cref="UserRole.Scholar"/> role and an <see cref="ScholarApplicationStatus.Approved"/>
/// application; a Scholar role given by hand on the users page is not enough. What: only a published
/// article outside the trash, and only its latest revision (what readers are served); the request
/// names the revision read, so an edit saved meanwhile is refused instead of confirmed unseen. Scope:
/// a scholar whose approved application names a canonical school reviews what readers of that school
/// see — the paragraphs common to all schools and, in a block of opinions, the opinion of their school
/// (or the default one where it has none); a scholar without a school reviews the whole article. The
/// scope is kept with the review. One review per scholar and revision: giving a verdict on the same
/// revision again replaces it (logged with the old verdict), the reviews of earlier revisions stay.
/// </para>
/// <para>
/// Hooks left for the next issues: the widget (V-04, #120) reads <see cref="MktbaDbContext.ArticleReviews"/>
/// per article; staleness after a substantial edit (V-05, #121) compares the review's revision with the
/// latest; remarks on a paragraph (V-06, #122) can refer to a review; the scholar's cabinet (V-07, #123)
/// replaces <see cref="ListAsync"/>; notifications are V-09 (#125).
/// </para>
/// </remarks>
public sealed class ArticleReviewService
{
    /// <summary>The page size when the request gives none.</summary>
    public const int DefaultPageSize = 20;

    /// <summary>The largest page of the list.</summary>
    public const int MaxPageSize = 100;

    private readonly MktbaDbContext _db;
    private readonly TimeProvider _clock;
    private readonly AuditLogRepository _auditLog;

    public ArticleReviewService(MktbaDbContext db, TimeProvider clock, AuditLogRepository auditLog)
    {
        _db = db;
        _clock = clock;
        _auditLog = auditLog;
    }

    /// <summary>
    /// One page of the published articles that have a revision, the latest edited first, with the
    /// caller's latest review of each; <paramref name="query"/> filters by title (case-insensitive).
    /// </summary>
    public async Task<ArticleReviewArticlePageDto> ListAsync(
        int userId, string? query, int page, int pageSize, CancellationToken cancellationToken)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);
        var articles = Reviewable().Where(article => article.Revisions.Any());
        var text = query?.Trim().ToLowerInvariant();
        if (!string.IsNullOrEmpty(text))
        {
            articles = articles.Where(article => article.Title.ToLower().Contains(text));
        }

        var total = await articles.CountAsync(cancellationToken);
        var items = await articles
            .OrderByDescending(article => article.UpdatedAt).ThenByDescending(article => article.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(article => new ArticleReviewArticleDto(
                article.Id,
                article.Title,
                article.Slug,
                article.Locale,
                article.Revisions.Max(revision => revision.Number),
                article.UpdatedAt,
                _db.ArticleReviews
                    .Where(review => review.ArticleId == article.Id && review.ScholarId == userId)
                    .OrderByDescending(review => review.Revision.Number)
                    .Select(review => new ArticleReviewMarkDto(review.Revision.Number, review.Verdict, review.UpdatedAt))
                    .FirstOrDefault()))
            .ToListAsync(cancellationToken);
        return new ArticleReviewArticlePageDto(items, total, page, pageSize);
    }

    /// <summary>The latest revision of a published article, the caller's scope and their reviews of it.</summary>
    /// <exception cref="NotFoundException">No such published article, or it has no revision yet.</exception>
    public async Task<ArticleReviewContextDto> GetAsync(int articleId, int userId, CancellationToken cancellationToken)
    {
        var article = await RequireArticleAsync(articleId, cancellationToken);
        var revision = await LatestRevisionAsync(articleId, cancellationToken);
        var scholar = await ScholarAsync(userId, cancellationToken);
        var mine = await _db.ArticleReviews.AsNoTracking()
            .Where(review => review.ArticleId == articleId && review.ScholarId == userId)
            .OrderByDescending(review => review.Revision.Number)
            .Select(review => new { Review = review, review.Revision.Number })
            .ToListAsync(cancellationToken);

        return new ArticleReviewContextDto(
            article.Id,
            article.Title,
            article.Slug,
            article.Locale,
            new ArticleReviewRevisionDto(revision.Number, revision.CreatedAt, ArticleSnapshots.Deserialize(revision.Snapshot)),
            await ScopeAsync(scholar, cancellationToken),
            scholar.Verified,
            mine.Select(row => ToDto(row.Review, row.Number, revision.Number)).ToList());
    }

    /// <summary>
    /// Gives the caller's verdict on the article's latest revision, replacing their earlier verdict on
    /// the same revision. The review and its audit entry are stored together.
    /// </summary>
    /// <exception cref="NotFoundException">No such published article, or it has no revision yet.</exception>
    /// <exception cref="ConflictException">The caller is not a verified scholar, or the revision is no longer the latest.</exception>
    /// <exception cref="ValidationException">An unknown verdict, or a missing or too long comment.</exception>
    public async Task<ArticleReviewDto> ReviewAsync(
        int articleId, int userId, ArticleReviewCreateDto dto, CancellationToken cancellationToken)
    {
        if (!Enum.IsDefined(dto.Verdict))
        {
            throw new ValidationException(AppErrors.ArticleReviewVerdictInvalid);
        }

        var comment = Comment(dto.Comment, dto.Verdict);
        var article = await RequireArticleAsync(articleId, cancellationToken);
        var scholar = await ScholarAsync(userId, cancellationToken);
        if (!scholar.Verified)
        {
            throw new ConflictException(AppErrors.ArticleReviewNotVerifiedScholar);
        }

        var revision = await LatestRevisionAsync(articleId, cancellationToken);
        if (revision.Number != dto.RevisionNumber)
        {
            throw new ConflictException(AppErrors.ArticleReviewRevisionOutdated(revision.Number));
        }

        var now = _clock.GetUtcNow().UtcDateTime;
        var review = await _db.ArticleReviews
            .FirstOrDefaultAsync(existing => existing.RevisionId == revision.Id && existing.ScholarId == userId, cancellationToken);
        var previous = review?.Verdict;
        if (review is null)
        {
            review = new ArticleReview
            {
                ArticleId = articleId,
                RevisionId = revision.Id,
                ScholarId = userId,
                CreatedAt = now,
            };
            _db.ArticleReviews.Add(review);
        }

        review.Verdict = dto.Verdict;
        review.Comment = comment;
        review.Mazhab = scholar.Mazhab;
        review.UpdatedAt = now;
        _auditLog.Add(new AuditLogEntry
        {
            OccurredAt = now,
            ActorId = userId,
            Action = AuditAction.ArticleReviewed,
            ArticleId = articleId,
            ArticleTitle = article.Title,
            FromValue = previous?.ToString(),
            ToValue = dto.Verdict.ToString(),
        });

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // The same scholar's first review of this revision was stored by a parallel request.
            throw new ConflictException(AppErrors.ArticleReviewConflict);
        }

        return ToDto(review, revision.Number, revision.Number);
    }

    /// <summary>Published articles outside the trash: what readers are served, so what a scholar reviews.</summary>
    private IQueryable<Article> Reviewable() =>
        _db.Articles.AsNoTracking().Where(article => article.Status == ArticleStatus.Published && article.DeletedAt == null);

    private async Task<Article> RequireArticleAsync(int articleId, CancellationToken cancellationToken) =>
        await Reviewable().FirstOrDefaultAsync(article => article.Id == articleId, cancellationToken)
        ?? throw new NotFoundException(AppErrors.ArticleNotFound);

    private async Task<ArticleRevision> LatestRevisionAsync(int articleId, CancellationToken cancellationToken) =>
        await _db.ArticleRevisions.AsNoTracking()
            .Where(revision => revision.ArticleId == articleId)
            .OrderByDescending(revision => revision.Number)
            .FirstOrDefaultAsync(cancellationToken)
        ?? throw new NotFoundException(AppErrors.ArticleNotFound);

    private sealed record Scholar(bool Verified, string? Mazhab);

    /// <summary>
    /// Whether the user is a verified scholar, and the school of their approved application. The
    /// newest approved application wins, though at most one stays approved: a new one needs a revocation first.
    /// </summary>
    private async Task<Scholar> ScholarAsync(int userId, CancellationToken cancellationToken)
    {
        var role = await _db.Users.AsNoTracking()
            .Where(user => user.Id == userId).Select(user => (UserRole?)user.Role)
            .FirstOrDefaultAsync(cancellationToken);
        if (role != UserRole.Scholar)
        {
            return new Scholar(false, null);
        }

        var approved = await _db.ScholarApplications.AsNoTracking()
            .Where(application => application.UserId == userId && application.Status == ScholarApplicationStatus.Approved)
            .OrderByDescending(application => application.ClosedAt).ThenByDescending(application => application.Id)
            .Select(application => new { application.Mazhab })
            .FirstOrDefaultAsync(cancellationToken);
        return approved is null ? new Scholar(false, null) : new Scholar(true, approved.Mazhab);
    }

    private async Task<ArticleReviewScopeDto> ScopeAsync(Scholar scholar, CancellationToken cancellationToken)
    {
        if (scholar.Mazhab is not { } mazhab)
        {
            return new ArticleReviewScopeDto(null, null);
        }

        var schoolId = await _db.Schools.AsNoTracking()
            .Where(school => school.IsSystem && school.Slug == mazhab).Select(school => (int?)school.Id)
            .FirstOrDefaultAsync(cancellationToken);
        return new ArticleReviewScopeDto(mazhab, schoolId);
    }

    /// <summary>
    /// The comment as plain text: trimmed, line breaks kept, at most <see cref="ArticleReview.CommentMaxLength"/>;
    /// null when blank, which only <see cref="ArticleReviewVerdict.Confirmed"/> allows.
    /// </summary>
    private static string? Comment(string? value, ArticleReviewVerdict verdict)
    {
        var text = (value ?? string.Empty).Replace("\r\n", "\n").Trim();
        if (text.Length == 0)
        {
            return verdict == ArticleReviewVerdict.Confirmed
                ? null
                : throw new ValidationException(AppErrors.ArticleReviewCommentRequired);
        }

        if (text.Length > ArticleReview.CommentMaxLength)
        {
            throw new ValidationException(AppErrors.ArticleReviewCommentTooLong(ArticleReview.CommentMaxLength));
        }

        return text;
    }

    private static ArticleReviewDto ToDto(ArticleReview review, int revisionNumber, int latestNumber) => new(
        review.Id,
        review.ArticleId,
        revisionNumber,
        review.Verdict,
        review.Comment,
        review.Mazhab,
        review.CreatedAt,
        review.UpdatedAt,
        revisionNumber == latestNumber);
}
