using Microsoft.EntityFrameworkCore;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Application.Services.Comments;

/// <summary>
/// The moderators' side of comments (C-02, #128; defaults chosen by the agent, open for the owner in
/// #128): the queues of held, reported and hidden comments, approving or hiding one, and barring a
/// user from commenting. Deleting stays <see cref="ArticleCommentService.DeleteAsync"/>.
/// </summary>
/// <remarks>
/// Approving publishes a comment (again) and settles the reports so far: only newer ones count. Hiding
/// takes it down for everyone, its author included («комментарий скрыт» while replies hang on it);
/// approving a hidden comment brings it back. A ban replaces the user's current one, lasts a number of
/// days or for good, and stops the user writing and editing comments (403 <c>comment_banned</c>); an
/// admin cannot be barred. The queues cover every comment that is not deleted, also on an article no
/// longer published.
/// </remarks>
public sealed class CommentModerationService
{
    /// <summary>Comments per queue page when the request gives none.</summary>
    public const int DefaultPageSize = 20;

    /// <summary>The largest queue page.</summary>
    public const int MaxPageSize = 100;

    /// <summary>The longest ban in days; longer is «for good».</summary>
    public const int MaxBanDays = 3650;

    private readonly MktbaDbContext _db;
    private readonly TimeProvider _clock;

    public CommentModerationService(MktbaDbContext db, TimeProvider clock)
    {
        _db = db;
        _clock = clock;
    }

    /// <summary>One page of a queue, with every queue's count.</summary>
    public async Task<CommentModerationPageDto> QueueAsync(CommentModerationQueue queue, int page, int pageSize, CancellationToken cancellationToken)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);
        var source = InQueue(queue);
        var ordered = queue == CommentModerationQueue.Hidden
            ? source.OrderByDescending(comment => comment.ModeratedAt).ThenByDescending(comment => comment.Id)
            : source.OrderBy(comment => comment.CreatedAt).ThenBy(comment => comment.Id);
        var total = await source.CountAsync(cancellationToken);
        var rows = await ordered
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(comment => new
            {
                comment.Id,
                comment.ArticleId,
                comment.Article.Title,
                comment.Article.Slug,
                Published = comment.Article.Status == ArticleStatus.Published && comment.Article.DeletedAt == null,
                comment.ParentId,
                comment.AuthorId,
                AuthorName = comment.Author != null ? comment.Author.DisplayName : null,
                AuthorEmail = comment.Author != null ? comment.Author.Email : null,
                comment.Body,
                comment.Status,
                comment.HoldReason,
                comment.CreatedAt,
                comment.EditedAt,
                comment.ModeratedAt,
            })
            .ToListAsync(cancellationToken);

        var ids = rows.Select(row => row.Id).ToList();
        var reports = await _db.ArticleCommentReports.AsNoTracking()
            .Where(report => ids.Contains(report.CommentId))
            .OrderByDescending(report => report.CreatedAt).ThenByDescending(report => report.Id)
            .Select(report => new
            {
                report.CommentId,
                report.Reason,
                report.Note,
                ReporterName = report.Reporter.DisplayName ?? report.Reporter.Email,
                report.CreatedAt,
            })
            .ToListAsync(cancellationToken);
        var authorIds = rows.Where(row => row.AuthorId is not null).Select(row => row.AuthorId!.Value).Distinct().ToList();
        var bans = await ActiveBans()
            .Where(ban => authorIds.Contains(ban.UserId))
            .ToDictionaryAsync(ban => ban.UserId, ban => ban.Until, cancellationToken);

        var items = rows.Select(row => new CommentModerationItemDto(
                row.Id,
                row.ArticleId,
                row.Title,
                row.Slug,
                row.Published,
                row.ParentId,
                row.AuthorId,
                string.IsNullOrWhiteSpace(row.AuthorName) ? null : row.AuthorName,
                row.AuthorEmail,
                row.AuthorId is int authorId && bans.ContainsKey(authorId),
                row.AuthorId is int bannedId && bans.TryGetValue(bannedId, out var until) ? until : null,
                row.Body,
                row.Status,
                row.HoldReason,
                row.CreatedAt,
                row.EditedAt,
                row.ModeratedAt,
                reports
                    .Where(report => report.CommentId == row.Id && (row.ModeratedAt is null || report.CreatedAt > row.ModeratedAt))
                    .Select(report => new CommentReportSummaryDto(report.Reason, report.Note, report.ReporterName, report.CreatedAt))
                    .ToList()))
            .ToList();

        var counts = new CommentModerationCountsDto(
            await InQueue(CommentModerationQueue.Pending).CountAsync(cancellationToken),
            await InQueue(CommentModerationQueue.Reported).CountAsync(cancellationToken),
            await InQueue(CommentModerationQueue.Hidden).CountAsync(cancellationToken));
        return new CommentModerationPageDto(items, total, page, pageSize, counts);
    }

    /// <summary>Approves or hides a comment that is not deleted.</summary>
    /// <exception cref="ValidationException">No action.</exception>
    /// <exception cref="NotFoundException">No such comment.</exception>
    /// <exception cref="ConflictException">The comment is deleted.</exception>
    public async Task ModerateAsync(int commentId, int moderatorId, CommentModerationDto dto, CancellationToken cancellationToken)
    {
        var action = dto.Action is CommentModerationAction value && Enum.IsDefined(value)
            ? value
            : throw new ValidationException(AppErrors.CommentModerationActionRequired);
        var comment = await _db.ArticleComments.FirstOrDefaultAsync(c => c.Id == commentId, cancellationToken)
            ?? throw new NotFoundException(AppErrors.CommentNotFound);
        if (comment.DeletedAt is not null)
        {
            throw new ConflictException(AppErrors.CommentDeleted);
        }

        comment.Status = action == CommentModerationAction.Approve ? ArticleCommentStatus.Published : ArticleCommentStatus.Hidden;
        comment.ModeratedAt = _clock.GetUtcNow().UtcDateTime;
        comment.ModeratedById = moderatorId;
        await _db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>The users barred from commenting now, the newest ban first.</summary>
    public async Task<IReadOnlyList<CommentBanDto>> ListBansAsync(CancellationToken cancellationToken) =>
        await ActiveBans()
            .OrderByDescending(ban => ban.CreatedAt).ThenByDescending(ban => ban.Id)
            .Select(ban => new CommentBanDto(
                ban.UserId,
                ban.User.Email,
                ban.User.DisplayName,
                ban.Until,
                ban.Reason,
                ban.CreatedAt,
                ban.CreatedBy != null ? ban.CreatedBy.DisplayName ?? ban.CreatedBy.Email : null))
            .ToListAsync(cancellationToken);

    /// <summary>Bars a user from commenting; it replaces their current ban.</summary>
    /// <exception cref="ValidationException">The days are out of range, or the reason is too long.</exception>
    /// <exception cref="NotFoundException">No such user.</exception>
    /// <exception cref="ConflictException">The user is an admin.</exception>
    public async Task<CommentBanDto> BanAsync(int userId, int moderatorId, CommentBanCreateDto dto, CancellationToken cancellationToken)
    {
        if (dto.Days is int days && (days < 1 || days > MaxBanDays))
        {
            throw new ValidationException(AppErrors.CommentBanDaysInvalid(MaxBanDays));
        }

        var reason = ArticleCommentService.CleanText(dto.Reason);
        if (reason?.Length > CommentBan.ReasonMaxLength)
        {
            throw new ValidationException(AppErrors.CommentBanReasonTooLong(CommentBan.ReasonMaxLength));
        }

        var user = await _db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.Role, u.Email, u.DisplayName })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException(AppErrors.UserNotFound(userId));
        if (user.Role == UserRole.Admin)
        {
            throw new ConflictException(AppErrors.CommentBanAdmin);
        }

        var now = _clock.GetUtcNow().UtcDateTime;
        var ban = await _db.CommentBans.FirstOrDefaultAsync(b => b.UserId == userId, cancellationToken);
        if (ban is null)
        {
            ban = new CommentBan { UserId = userId };
            _db.CommentBans.Add(ban);
        }

        ban.Until = dto.Days is int length ? now.AddDays(length) : null;
        ban.Reason = reason;
        ban.CreatedAt = now;
        ban.CreatedById = moderatorId;
        await _db.SaveChangesAsync(cancellationToken);

        var moderator = await _db.Users.AsNoTracking()
            .Where(u => u.Id == moderatorId)
            .Select(u => u.DisplayName ?? u.Email)
            .FirstOrDefaultAsync(cancellationToken);
        return new CommentBanDto(userId, user.Email, user.DisplayName, ban.Until, ban.Reason, ban.CreatedAt, moderator);
    }

    /// <summary>Lifts a user's ban; nothing happens when there is none.</summary>
    public async Task UnbanAsync(int userId, CancellationToken cancellationToken)
    {
        var ban = await _db.CommentBans.FirstOrDefaultAsync(b => b.UserId == userId, cancellationToken);
        if (ban is not null)
        {
            _db.CommentBans.Remove(ban);
            await _db.SaveChangesAsync(cancellationToken);
        }
    }

    private IQueryable<CommentBan> ActiveBans()
    {
        var now = _clock.GetUtcNow().UtcDateTime;
        return _db.CommentBans.AsNoTracking().Where(ban => ban.Until == null || ban.Until > now);
    }

    private IQueryable<ArticleComment> InQueue(CommentModerationQueue queue)
    {
        var comments = _db.ArticleComments.AsNoTracking().Where(comment => comment.DeletedAt == null);
        return queue switch
        {
            CommentModerationQueue.Reported => comments.Where(comment => comment.Status == ArticleCommentStatus.Published
                && _db.ArticleCommentReports.Any(report => report.CommentId == comment.Id
                    && (comment.ModeratedAt == null || report.CreatedAt > comment.ModeratedAt))),
            CommentModerationQueue.Hidden => comments.Where(comment => comment.Status == ArticleCommentStatus.Hidden),
            _ => comments.Where(comment => comment.Status == ArticleCommentStatus.Pending),
        };
    }
}
