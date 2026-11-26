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
/// per article; staleness after a substantial edit (V-05, #121) compares the fingerprints of the
/// review's revision and the latest one for the review's scope (<see cref="ReviewFingerprints"/>); remarks on a block (V-06, #122)
/// are <see cref="ArticleRemarkService"/>, made from this page on the same revision; the scholar's cabinet (V-07, #123)
/// replaces <see cref="ListAsync"/>; notifications are V-09 (#125), which can tell a scholar of the
/// articles <see cref="ListNeedingReReviewAsync"/> returns (the re-review request of D5).
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
    /// One page of the published articles that have a revision, with the caller's latest review of
    /// each: first the articles whose review a substantial edit made stale (the re-review request,
    /// V-05 #121), then the rest, the latest edited first; <paramref name="query"/> filters by title
    /// (case-insensitive). The count of the stale ones is over all articles, not only the filtered.
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

        var stale = await ListNeedingReReviewAsync(userId, cancellationToken);
        var total = await articles.CountAsync(cancellationToken);
        var rows = await articles
            .OrderByDescending(article => stale.Contains(article.Id))
            .ThenByDescending(article => article.UpdatedAt).ThenByDescending(article => article.Id)
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
                    .Select(review => new ArticleReviewMarkDto(review.Revision.Number, review.Verdict, review.UpdatedAt, true))
                    .FirstOrDefault()))
            .ToListAsync(cancellationToken);
        var items = rows
            .Select(item => item.MyLatestReview is { } mark && stale.Contains(item.ArticleId)
                ? item with { MyLatestReview = mark with { IsCurrent = false } }
                : item)
            .ToList();
        return new ArticleReviewArticlePageDto(items, total, page, pageSize, stale.Count);
    }

    /// <summary>
    /// The re-review requests of a scholar (D5, #115; V-05, #121): the published articles whose latest
    /// review by <paramref name="scholarId"/> a substantial edit has made stale — the text their scope
    /// covers changed since the revision they reviewed. The hook for notifications (V-09, #125).
    /// </summary>
    public async Task<List<int>> ListNeedingReReviewAsync(int scholarId, CancellationToken cancellationToken)
    {
        var reviews = await _db.ArticleReviews.AsNoTracking()
            .Where(review => review.ScholarId == scholarId
                && review.Article.Status == ArticleStatus.Published && review.Article.DeletedAt == null)
            .Select(review => new { review.ArticleId, review.RevisionId, review.Revision.Number, review.Mazhab })
            .ToListAsync(cancellationToken);
        var latestReviews = reviews
            .GroupBy(review => review.ArticleId)
            .Select(group => group.OrderByDescending(review => review.Number).First())
            .ToList();
        if (latestReviews.Count == 0)
        {
            return [];
        }

        var articleIds = latestReviews.Select(review => review.ArticleId).ToList();
        var revisions = await _db.ArticleRevisions.AsNoTracking()
            .Where(revision => articleIds.Contains(revision.ArticleId))
            .Select(revision => new { revision.ArticleId, revision.Id, revision.Number })
            .ToListAsync(cancellationToken);
        var latestRevisions = revisions
            .GroupBy(revision => revision.ArticleId)
            .ToDictionary(group => group.Key, group => group.MaxBy(revision => revision.Number)!);
        var candidates = latestReviews.Where(review => latestRevisions[review.ArticleId].Number != review.Number).ToList();
        if (candidates.Count == 0)
        {
            return [];
        }

        var hashes = await HashesAsync(
            candidates.SelectMany(review => new[] { review.RevisionId, latestRevisions[review.ArticleId].Id }), cancellationToken);
        return candidates
            .Where(review => !SameText(hashes, review.RevisionId, latestRevisions[review.ArticleId].Id, review.Mazhab))
            .Select(review => review.ArticleId)
            .ToList();
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
        var hashes = await HashesAsync(mine.Select(row => row.Review.RevisionId).Append(revision.Id), cancellationToken);

        return new ArticleReviewContextDto(
            article.Id,
            article.Title,
            article.Slug,
            article.Locale,
            new ArticleReviewRevisionDto(
                revision.Number,
                revision.CreatedAt,
                // The blocks' ids, which remarks refer to (V-06, #122), also for a snapshot older than version 4.
                RemarkAnchors.WithIds(
                    ArticleSnapshots.Deserialize(revision.Snapshot),
                    await RemarkAnchors.LiveParagraphsAsync(_db, articleId, cancellationToken))),
            await ScopeAsync(scholar, cancellationToken),
            scholar.Verified,
            mine.Select(row => ToDto(row.Review, row.Number, revision.Number,
                SameText(hashes, row.Review.RevisionId, revision.Id, row.Review.Mazhab))).ToList());
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

        return ToDto(review, revision.Number, revision.Number, true);
    }

    /// <summary>
    /// The marks readers see on an article (V-04, #120): the latest mark of each scholar who is still
    /// verified, the newest revision first. An article readers are not served (not Published, in the
    /// trash, unknown) or one without a revision has no marks, so the answer tells nothing of drafts.
    /// </summary>
    /// <remarks>
    /// Defaults chosen by the agent, open for the owner in #120: a scholar whose status was revoked
    /// (or whose role changed) no longer counts and their marks are not shown; the comment stays
    /// between the scholar and the editors (the review form addresses it to them), readers see the
    /// verdict, the scope, the revision and the date. The name is the profile's (U-07), never an email.
    /// </remarks>
    public async Task<ArticleVerificationDto> GetVerificationAsync(int articleId, CancellationToken cancellationToken)
    {
        var empty = new ArticleVerificationDto(null, []);
        if (!await Reviewable().AnyAsync(article => article.Id == articleId, cancellationToken))
        {
            return empty;
        }

        var latest = await _db.ArticleRevisions.AsNoTracking()
            .Where(revision => revision.ArticleId == articleId)
            .OrderByDescending(revision => revision.Number)
            .Select(revision => new { revision.Id, revision.Number })
            .FirstOrDefaultAsync(cancellationToken);
        if (latest is null)
        {
            return empty;
        }

        var latestNumber = latest.Number;

        var rows = await _db.ArticleReviews.AsNoTracking()
            .Where(review => review.ArticleId == articleId
                && review.Scholar.Role == UserRole.Scholar
                && _db.ScholarApplications.Any(application =>
                    application.UserId == review.ScholarId && application.Status == ScholarApplicationStatus.Approved))
            .Select(review => new
            {
                review.ScholarId,
                review.Scholar.DisplayName,
                review.Scholar.Slug,
                // The author page answers only for someone credited on a Published article (P-06, #94).
                HasPublicPage = _db.Articles.Any(article => article.Status == ArticleStatus.Published
                    && (article.AuthorId == review.ScholarId || article.CoAuthors.Any(coAuthor => coAuthor.UserId == review.ScholarId))),
                review.Verdict,
                review.Mazhab,
                review.RevisionId,
                review.Revision.Number,
                review.UpdatedAt,
            })
            .ToListAsync(cancellationToken);

        var latestMarks = rows
            .GroupBy(row => row.ScholarId)
            .Select(group => group.OrderByDescending(row => row.Number).First())
            .OrderByDescending(row => row.Number).ThenByDescending(row => row.UpdatedAt)
            .ToList();
        var hashes = await HashesAsync(latestMarks.Select(row => row.RevisionId).Append(latest.Id), cancellationToken);
        var marks = latestMarks
            .Select(row => new ArticleVerificationMarkDto(
                row.DisplayName,
                row.DisplayName is not null && row.HasPublicPage ? row.Slug : null,
                row.Verdict,
                row.Mazhab,
                row.Number,
                row.UpdatedAt,
                row.Number == latestNumber,
                SameText(hashes, row.RevisionId, latest.Id, row.Mazhab)))
            .ToList();
        return new ArticleVerificationDto(latestNumber, marks);
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

    /// <summary>The fingerprints of these revisions, by revision and scope.</summary>
    private async Task<Dictionary<(int RevisionId, string Scope), string>> HashesAsync(
        IEnumerable<int> revisionIds, CancellationToken cancellationToken)
    {
        var ids = revisionIds.Distinct().ToList();
        var rows = await _db.ArticleRevisionFingerprints.AsNoTracking()
            .Where(fingerprint => ids.Contains(fingerprint.RevisionId))
            .Select(fingerprint => new { fingerprint.RevisionId, fingerprint.Scope, fingerprint.Hash })
            .ToListAsync(cancellationToken);
        return rows.ToDictionary(row => (row.RevisionId, row.Scope), row => row.Hash);
    }

    /// <summary>
    /// Whether a review of <paramref name="reviewedId"/> with this scope is still current on the
    /// revision <paramref name="latestId"/>: the same revision, or the same text for that scope. A
    /// missing fingerprint (not filled yet) counts as a change, so a mark is never shown current unchecked.
    /// </summary>
    private static bool SameText(
        Dictionary<(int RevisionId, string Scope), string> hashes, int reviewedId, int latestId, string? mazhab)
    {
        if (reviewedId == latestId)
        {
            return true;
        }

        var scope = ReviewFingerprints.ScopeOf(mazhab);
        return hashes.TryGetValue((reviewedId, scope), out var reviewed)
            && hashes.TryGetValue((latestId, scope), out var current)
            && reviewed == current;
    }

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

    private static ArticleReviewDto ToDto(ArticleReview review, int revisionNumber, int latestNumber, bool isCurrent) => new(
        review.Id,
        review.ArticleId,
        revisionNumber,
        review.Verdict,
        review.Comment,
        review.Mazhab,
        review.CreatedAt,
        review.UpdatedAt,
        revisionNumber == latestNumber,
        isCurrent);
}
