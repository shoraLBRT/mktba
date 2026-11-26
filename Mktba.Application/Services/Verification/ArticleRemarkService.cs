using Microsoft.EntityFrameworkCore;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services.Verification;

/// <summary>
/// Remarks on a block (V-06, #122): a verified scholar ties a remark to one paragraph — or one opinion
/// of a block of opinions — of the revision they read; the article's authors and the editors reply
/// and close it (fixed, or closed without a change); the scholar may reopen it.
/// </summary>
/// <remarks>
/// <para>
/// Defaults chosen by the agent, open for the owner in #122. Who sees a remark: its scholar, the
/// article's author and co-authors, and the editors (admins) — never readers, never another scholar.
/// Who makes one: a verified scholar (the rule of <see cref="ArticleReviewService"/>), on a published
/// article outside the trash, on its latest revision only (the request names it, as a review does);
/// the block is any paragraph of that revision, a heading included, and is not limited to the
/// scholar's madhab scope. Who replies: the participants while the remark is open (the scholar only
/// while still verified). Who closes: the authors and the editors, as fixed (<see cref="ArticleRemarkStatus.Resolved"/>)
/// or without a change (<see cref="ArticleRemarkStatus.Closed"/>), optionally with a last message.
/// Who reopens: the scholar (still verified) or an editor. A remark is not a verdict: it neither needs
/// nor changes the scholar's review of the revision. Making, closing and reopening are audit entries;
/// replies are not. A trashed article's remarks are seen only by the editors.
/// </para>
/// <para>
/// The block: the remark keeps the paragraph's and the opinion's working-copy ids, which an editor
/// save and a restore keep while the block exists; once it is deleted the remark stays, shown as
/// «блок удалён» with the excerpt it was made on.
/// </para>
/// <para>
/// Hook for notifications (V-09, #125): every change goes through <see cref="CreateAsync"/>,
/// <see cref="ReplyAsync"/>, <see cref="CloseAsync"/> and <see cref="ReopenAsync"/>, each saving once —
/// tell the authors of a new remark or a scholar's reply, and the scholar of a reply or closing, there.
/// </para>
/// </remarks>
public sealed class ArticleRemarkService
{
    private readonly MktbaDbContext _db;
    private readonly TimeProvider _clock;
    private readonly AuditLogRepository _auditLog;

    public ArticleRemarkService(MktbaDbContext db, TimeProvider clock, AuditLogRepository auditLog)
    {
        _db = db;
        _clock = clock;
        _auditLog = auditLog;
    }

    /// <summary>The remarks on the article the caller may see: all of them for its authors and the editors, a scholar's own for a scholar.</summary>
    /// <exception cref="NotFoundException">No such article, or the caller has no part in its remarks.</exception>
    public async Task<ArticleRemarkListDto> ListAsync(int articleId, int userId, CancellationToken cancellationToken)
    {
        var article = await ArticleAsync(articleId, cancellationToken) ?? throw new NotFoundException(AppErrors.ArticleNotFound);
        var caller = await CallerAsync(userId, article, cancellationToken);
        if (!caller.SeesAll && !caller.MayBeScholar)
        {
            throw new NotFoundException(AppErrors.ArticleNotFound);
        }

        var remarks = await _db.ArticleRemarks.AsNoTracking()
            .Where(remark => remark.ArticleId == articleId && (caller.SeesAll || remark.ScholarId == userId))
            .ToListAsync(cancellationToken);
        var items = await ToDtosAsync(remarks, article, caller, cancellationToken);
        var canCreate = caller.VerifiedScholar && article.Status == ArticleStatus.Published && article.DeletedAt is null;
        return new ArticleRemarkListDto(canCreate, items
            .OrderBy(remark => remark.Status == ArticleRemarkStatus.Open ? 0 : 1)
            .ThenByDescending(remark => remark.UpdatedAt).ThenByDescending(remark => remark.Id)
            .ToList());
    }

    /// <summary>The page size of the scholar's history when the request gives none (V-07, #123).</summary>
    public const int DefaultPageSize = 20;

    /// <summary>The largest page of the scholar's history.</summary>
    public const int MaxPageSize = 100;

    /// <summary>
    /// The caller's own remarks across articles, for their cabinet (V-07, #123), the latest changed
    /// first; <paramref name="open"/> true keeps the open ones, false the closed ones (fixed or not),
    /// null all. A trashed article's remarks are left out: only the editors see them.
    /// </summary>
    public async Task<ScholarRemarkHistoryPageDto> ListMineAsync(
        int userId, bool? open, int page, int pageSize, CancellationToken cancellationToken)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);
        var mine = _db.ArticleRemarks.AsNoTracking()
            .Where(remark => remark.ScholarId == userId && remark.Article.DeletedAt == null);
        var openTotal = await mine.CountAsync(remark => remark.Status == ArticleRemarkStatus.Open, cancellationToken);
        var filtered = open switch
        {
            true => mine.Where(remark => remark.Status == ArticleRemarkStatus.Open),
            false => mine.Where(remark => remark.Status != ArticleRemarkStatus.Open),
            null => mine,
        };
        var total = await filtered.CountAsync(cancellationToken);
        var items = await filtered
            .OrderByDescending(remark => remark.UpdatedAt).ThenByDescending(remark => remark.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(remark => new ScholarRemarkHistoryItemDto(
                remark.Id,
                remark.ArticleId,
                remark.Article.Title,
                remark.Article.Status == ArticleStatus.Published,
                remark.Revision.Number,
                remark.OnOpinion,
                remark.Excerpt,
                remark.Status,
                remark.CreatedAt,
                remark.UpdatedAt,
                remark.Messages.Count))
            .ToListAsync(cancellationToken);
        return new ScholarRemarkHistoryPageDto(items, total, page, pageSize, openTotal);
    }

    /// <summary>A verified scholar's remark on a block of the article's latest revision.</summary>
    /// <exception cref="ValidationException">No text or too long, or the block is not in that revision or no longer in the article.</exception>
    /// <exception cref="NotFoundException">No such published article, or it has no revision.</exception>
    /// <exception cref="ConflictException">The caller is not a verified scholar, or the revision is no longer the latest.</exception>
    public async Task<ArticleRemarkDto> CreateAsync(int articleId, int userId, ArticleRemarkCreateDto dto, CancellationToken cancellationToken)
    {
        var body = Body(dto.Body);
        var article = await ArticleAsync(articleId, cancellationToken);
        if (article is null || article.Status != ArticleStatus.Published || article.DeletedAt is not null)
        {
            throw new NotFoundException(AppErrors.ArticleNotFound);
        }

        var caller = await CallerAsync(userId, article, cancellationToken);
        if (!caller.VerifiedScholar)
        {
            throw new ConflictException(AppErrors.ArticleReviewNotVerifiedScholar);
        }

        var revision = await _db.ArticleRevisions.AsNoTracking()
            .Where(candidate => candidate.ArticleId == articleId)
            .OrderByDescending(candidate => candidate.Number)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException(AppErrors.ArticleNotFound);
        if (revision.Number != dto.RevisionNumber)
        {
            throw new ConflictException(AppErrors.ArticleReviewRevisionOutdated(revision.Number));
        }

        var live = await RemarkAnchors.LiveParagraphsAsync(_db, articleId, cancellationToken);
        var snapshot = RemarkAnchors.WithIds(ArticleSnapshots.Deserialize(revision.Snapshot), live);
        var paragraph = snapshot.Paragraphs.FirstOrDefault(candidate => candidate.Id == dto.ParagraphId);
        var current = live.FirstOrDefault(candidate => candidate.Id == dto.ParagraphId);
        if (paragraph is null || current is null)
        {
            throw new ValidationException(AppErrors.ArticleRemarkBlockInvalid);
        }

        ArticleSnapshotOpinionDto? opinion = null;
        if (dto.OpinionId is int opinionId)
        {
            opinion = paragraph.Opinions.FirstOrDefault(candidate => candidate.Id == opinionId);
            if (opinion is null || paragraph.Opinions.Count < 2 || !current.OpinionIds.Contains(opinionId))
            {
                throw new ValidationException(AppErrors.ArticleRemarkBlockInvalid);
            }
        }

        var now = _clock.GetUtcNow().UtcDateTime;
        var remark = new ArticleRemark
        {
            ArticleId = articleId,
            RevisionId = revision.Id,
            ScholarId = userId,
            ParagraphId = dto.ParagraphId,
            OpinionId = opinion?.Id,
            OnOpinion = opinion is not null,
            ParagraphOrder = paragraph.Order,
            Excerpt = RemarkAnchors.Excerpt(opinion is not null ? [opinion.Content] : paragraph.Opinions.Select(candidate => candidate.Content)),
            Status = ArticleRemarkStatus.Open,
            CreatedAt = now,
            UpdatedAt = now,
            Messages = [new ArticleRemarkMessage { AuthorId = userId, Body = body, CreatedAt = now }],
        };
        _db.ArticleRemarks.Add(remark);
        Audit(AuditAction.ArticleRemarkCreated, userId, article, from: null, to: null, now);
        await _db.SaveChangesAsync(cancellationToken);
        return await OneAsync(remark, article, caller, cancellationToken);
    }

    /// <summary>A reply in an open remark's thread.</summary>
    /// <exception cref="NotFoundException">No such remark, or the caller has no part in it.</exception>
    /// <exception cref="ConflictException">The remark is closed, or the caller is its scholar and no longer verified.</exception>
    public async Task<ArticleRemarkDto> ReplyAsync(int remarkId, int userId, ArticleRemarkReplyDto dto, CancellationToken cancellationToken)
    {
        var body = Body(dto.Body);
        var (remark, article, caller) = await RequireAsync(remarkId, userId, cancellationToken);
        if (remark.Status != ArticleRemarkStatus.Open)
        {
            throw new ConflictException(AppErrors.ArticleRemarkClosed);
        }

        if (!caller.SeesAll && !caller.VerifiedScholar)
        {
            throw new ConflictException(AppErrors.ArticleReviewNotVerifiedScholar);
        }

        var now = _clock.GetUtcNow().UtcDateTime;
        remark.Messages.Add(new ArticleRemarkMessage { AuthorId = userId, Body = body, CreatedAt = now });
        remark.UpdatedAt = now;
        await _db.SaveChangesAsync(cancellationToken);
        return await OneAsync(remark, article, caller, cancellationToken);
    }

    /// <summary>The authors or an editor close an open remark, as fixed or without a change.</summary>
    /// <exception cref="ValidationException">Neither outcome, or the message is too long.</exception>
    /// <exception cref="NotFoundException">No such remark, or the caller has no part in it.</exception>
    /// <exception cref="ForbiddenException">The caller is the remark's scholar, not an author or an editor.</exception>
    /// <exception cref="ConflictException">The remark is already closed.</exception>
    public async Task<ArticleRemarkDto> CloseAsync(int remarkId, int userId, ArticleRemarkCloseDto dto, CancellationToken cancellationToken)
    {
        if (dto.Outcome is not (ArticleRemarkStatus.Resolved or ArticleRemarkStatus.Closed))
        {
            throw new ValidationException(AppErrors.ArticleRemarkOutcomeInvalid);
        }

        var message = OptionalBody(dto.Message);
        var (remark, article, caller) = await RequireAsync(remarkId, userId, cancellationToken);
        if (!caller.SeesAll)
        {
            throw new ForbiddenException(AppErrors.Forbidden);
        }

        if (remark.Status != ArticleRemarkStatus.Open)
        {
            throw new ConflictException(AppErrors.ArticleRemarkClosed);
        }

        var now = _clock.GetUtcNow().UtcDateTime;
        AddOptional(remark, userId, message, now);
        remark.Status = dto.Outcome;
        remark.ClosedAt = now;
        remark.ClosedById = userId;
        remark.UpdatedAt = now;
        Audit(AuditAction.ArticleRemarkClosed, userId, article, from: null, to: dto.Outcome.ToString(), now);
        await _db.SaveChangesAsync(cancellationToken);
        return await OneAsync(remark, article, caller, cancellationToken);
    }

    /// <summary>The remark's scholar or an editor reopen a closed remark.</summary>
    /// <exception cref="ValidationException">The message is too long.</exception>
    /// <exception cref="NotFoundException">No such remark, or the caller has no part in it.</exception>
    /// <exception cref="ForbiddenException">The caller is an author, not the scholar or an editor.</exception>
    /// <exception cref="ConflictException">The remark is open, or the caller is its scholar and no longer verified.</exception>
    public async Task<ArticleRemarkDto> ReopenAsync(int remarkId, int userId, ArticleRemarkReopenDto dto, CancellationToken cancellationToken)
    {
        var message = OptionalBody(dto.Message);
        var (remark, article, caller) = await RequireAsync(remarkId, userId, cancellationToken);
        var isScholar = remark.ScholarId == userId;
        if (!isScholar && !caller.IsEditor)
        {
            throw new ForbiddenException(AppErrors.Forbidden);
        }

        if (remark.Status == ArticleRemarkStatus.Open)
        {
            throw new ConflictException(AppErrors.ArticleRemarkAlreadyOpen);
        }

        if (!caller.IsEditor && !caller.VerifiedScholar)
        {
            throw new ConflictException(AppErrors.ArticleReviewNotVerifiedScholar);
        }

        var now = _clock.GetUtcNow().UtcDateTime;
        var previous = remark.Status;
        AddOptional(remark, userId, message, now);
        remark.Status = ArticleRemarkStatus.Open;
        remark.ClosedAt = null;
        remark.ClosedById = null;
        remark.UpdatedAt = now;
        Audit(AuditAction.ArticleRemarkReopened, userId, article, from: previous.ToString(), to: null, now);
        await _db.SaveChangesAsync(cancellationToken);
        return await OneAsync(remark, article, caller, cancellationToken);
    }

    private sealed record ArticleRow(int Id, string Title, ArticleStatus Status, DateTime? DeletedAt, int? AuthorId, List<int> CoAuthorIds)
    {
        public bool IsAuthor(int userId) => AuthorId == userId || CoAuthorIds.Contains(userId);
    }

    /// <summary>The caller's part in an article's remarks.</summary>
    /// <param name="SeesAll">An author or co-author (outside the trash) or an editor: sees, answers and closes every remark.</param>
    /// <param name="MayBeScholar">Has the Scholar role: sees their own remarks.</param>
    /// <param name="VerifiedScholar">The Scholar role and an approved application: makes remarks and acts on their own.</param>
    private sealed record Caller(int UserId, bool IsEditor, bool SeesAll, bool MayBeScholar, bool VerifiedScholar);

    private Task<ArticleRow?> ArticleAsync(int articleId, CancellationToken cancellationToken) =>
        _db.Articles.AsNoTracking()
            .Where(article => article.Id == articleId)
            .Select(article => new ArticleRow(
                article.Id,
                article.Title,
                article.Status,
                article.DeletedAt,
                article.AuthorId,
                article.CoAuthors.Select(coAuthor => coAuthor.UserId).ToList()))
            .FirstOrDefaultAsync(cancellationToken);

    private async Task<Caller> CallerAsync(int userId, ArticleRow article, CancellationToken cancellationToken)
    {
        var role = await _db.Users.AsNoTracking()
            .Where(user => user.Id == userId).Select(user => (UserRole?)user.Role)
            .FirstOrDefaultAsync(cancellationToken);
        var isEditor = role == UserRole.Admin;
        var seesAll = isEditor || (article.DeletedAt is null && article.IsAuthor(userId));
        var mayBeScholar = role == UserRole.Scholar && article.DeletedAt is null;
        var verified = mayBeScholar && await _db.ScholarApplications.AsNoTracking()
            .AnyAsync(application => application.UserId == userId && application.Status == ScholarApplicationStatus.Approved, cancellationToken);
        return new Caller(userId, isEditor, seesAll, mayBeScholar, verified);
    }

    /// <summary>The remark (tracked, with its messages), its article and the caller's part, or 404 when the caller has none.</summary>
    private async Task<(ArticleRemark Remark, ArticleRow Article, Caller Caller)> RequireAsync(
        int remarkId, int userId, CancellationToken cancellationToken)
    {
        var remark = await _db.ArticleRemarks
            .Include(candidate => candidate.Messages)
            .FirstOrDefaultAsync(candidate => candidate.Id == remarkId, cancellationToken)
            ?? throw new NotFoundException(AppErrors.ArticleRemarkNotFound);
        var article = await ArticleAsync(remark.ArticleId, cancellationToken)
            ?? throw new NotFoundException(AppErrors.ArticleRemarkNotFound);
        var caller = await CallerAsync(userId, article, cancellationToken);
        if (!caller.SeesAll && !(caller.MayBeScholar && remark.ScholarId == userId))
        {
            throw new NotFoundException(AppErrors.ArticleRemarkNotFound);
        }

        return (remark, article, caller);
    }

    private async Task<ArticleRemarkDto> OneAsync(ArticleRemark remark, ArticleRow article, Caller caller, CancellationToken cancellationToken) =>
        (await ToDtosAsync([remark], article, caller, cancellationToken)).Single();

    private async Task<List<ArticleRemarkDto>> ToDtosAsync(
        IReadOnlyList<ArticleRemark> remarks, ArticleRow article, Caller caller, CancellationToken cancellationToken)
    {
        if (remarks.Count == 0)
        {
            return [];
        }

        var remarkIds = remarks.Select(remark => remark.Id).ToList();
        var revisionIds = remarks.Select(remark => remark.RevisionId).Distinct().ToList();
        var revisionNumbers = await _db.ArticleRevisions.AsNoTracking()
            .Where(revision => revisionIds.Contains(revision.Id))
            .ToDictionaryAsync(revision => revision.Id, revision => revision.Number, cancellationToken);
        var messages = await _db.ArticleRemarkMessages.AsNoTracking()
            .Where(message => remarkIds.Contains(message.RemarkId))
            .OrderBy(message => message.CreatedAt).ThenBy(message => message.Id)
            .Select(message => new
            {
                message.Id,
                message.RemarkId,
                message.AuthorId,
                Name = message.Author == null ? null : message.Author.DisplayName,
                Role = message.Author == null ? (UserRole?)null : message.Author.Role,
                message.Body,
                message.CreatedAt,
            })
            .ToListAsync(cancellationToken);
        var scholarIds = remarks.Select(remark => remark.ScholarId).Distinct().ToList();
        var scholarNames = await _db.Users.AsNoTracking()
            .Where(user => scholarIds.Contains(user.Id))
            .ToDictionaryAsync(user => user.Id, user => user.DisplayName, cancellationToken);
        var live = (await RemarkAnchors.LiveParagraphsAsync(_db, article.Id, cancellationToken)).ToDictionary(paragraph => paragraph.Id);

        return remarks.Select(remark =>
        {
            live.TryGetValue(remark.ParagraphId ?? 0, out var paragraph);
            var removed = paragraph is null
                || (remark.OnOpinion && (remark.OpinionId is not int opinionId || !paragraph.OpinionIds.Contains(opinionId)));
            var isOpen = remark.Status == ArticleRemarkStatus.Open;
            var isScholar = remark.ScholarId == caller.UserId;
            return new ArticleRemarkDto(
                remark.Id,
                remark.ArticleId,
                revisionNumbers.GetValueOrDefault(remark.RevisionId),
                paragraph is null ? null : remark.ParagraphId,
                removed ? null : remark.OpinionId,
                remark.OnOpinion,
                remark.ParagraphOrder,
                paragraph?.Order,
                remark.Excerpt,
                removed,
                remark.Status,
                scholarNames.GetValueOrDefault(remark.ScholarId),
                isScholar,
                remark.CreatedAt,
                remark.UpdatedAt,
                remark.ClosedAt,
                CanReply: isOpen && (caller.SeesAll || (isScholar && caller.VerifiedScholar)),
                CanClose: isOpen && caller.SeesAll,
                CanReopen: !isOpen && (caller.IsEditor || (isScholar && caller.VerifiedScholar)),
                messages
                    .Where(message => message.RemarkId == remark.Id)
                    .Select(message => new ArticleRemarkMessageDto(
                        message.Id,
                        message.Name,
                        Participant(message.AuthorId, message.Role, remark.ScholarId, article),
                        message.AuthorId == caller.UserId,
                        message.Body,
                        message.CreatedAt))
                    .ToList());
        }).ToList();
    }

    private static ArticleRemarkParticipant Participant(int? authorId, UserRole? role, int scholarId, ArticleRow article) => authorId switch
    {
        null => ArticleRemarkParticipant.Former,
        _ when authorId == scholarId => ArticleRemarkParticipant.Scholar,
        int id when article.IsAuthor(id) => ArticleRemarkParticipant.Author,
        _ when role == UserRole.Admin => ArticleRemarkParticipant.Editor,
        _ => ArticleRemarkParticipant.Former,
    };

    private void Audit(AuditAction action, int actorId, ArticleRow article, string? from, string? to, DateTime now) =>
        _auditLog.Add(new AuditLogEntry
        {
            OccurredAt = now,
            ActorId = actorId,
            Action = action,
            ArticleId = article.Id,
            ArticleTitle = article.Title,
            FromValue = from,
            ToValue = to,
        });

    private static void AddOptional(ArticleRemark remark, int userId, string? message, DateTime now)
    {
        if (message is not null)
        {
            remark.Messages.Add(new ArticleRemarkMessage { AuthorId = userId, Body = message, CreatedAt = now });
        }
    }

    /// <summary>A message as plain text: trimmed, line breaks kept, required, at most <see cref="ArticleRemark.MessageMaxLength"/>.</summary>
    private static string Body(string? value) =>
        OptionalBody(value) ?? throw new ValidationException(AppErrors.ArticleRemarkBodyRequired);

    private static string? OptionalBody(string? value)
    {
        var text = (value ?? string.Empty).Replace("\r\n", "\n").Trim();
        if (text.Length > ArticleRemark.MessageMaxLength)
        {
            throw new ValidationException(AppErrors.ArticleRemarkBodyTooLong(ArticleRemark.MessageMaxLength));
        }

        return text.Length == 0 ? null : text;
    }
}
