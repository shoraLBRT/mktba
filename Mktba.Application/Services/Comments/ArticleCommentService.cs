using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Application.Services.Comments;

/// <summary>
/// Readers' comments under a published article (C-01, #127): the public list, a new comment or a
/// reply, editing one's own, deleting one's own (an admin any).
/// </summary>
/// <remarks>
/// <para>
/// Defaults chosen by the agent, open for the owner in #127. Comments exist only on a Published
/// article outside the trash: for any other the list and every write answer 404. Anyone may read
/// them; any signed-in user (every role) may write one once their email is confirmed (U-05) and their
/// profile has a display name — the comment is signed with it, never with the email. A reply answers
/// any comment of the same article that is not deleted, at any depth; the page indents only the
/// first levels. The author may edit their text at any time (the comment then shows «изменён») and
/// delete it; an admin may delete any. Deleting is soft: the text is erased, the row stays while
/// replies hang on it and is listed as «комментарий удалён»; a deleted comment cannot be edited or
/// answered. The list pages by top-level comments, oldest first, each with its whole reply tree.
/// </para>
/// <para>
/// Protection: the trap field <see cref="ArticleCommentCreateDto.Website"/> (the feedback pattern),
/// <see cref="CommentOptions.PerUserLimit"/> comments per account in a window counted from the table,
/// and the per-IP limiter <c>RateLimiting:Comments</c> on every write. The body is stored as typed
/// (trimmed, line breaks as "\n", without control characters and bidirectional overrides) and never
/// rendered into HTML here: the page renders the Markdown through a restricted schema.
/// </para>
/// <para>
/// Moderation (C-02, #128; defaults chosen by the agent, open for the owner in #128): a new comment is
/// held for a moderator (<see cref="ArticleCommentStatus.Pending"/>, seen by its author only) when the
/// spam filter catches it (every role but an admin: <see cref="CommentSpamFilter"/>, or the author's
/// own text again within <see cref="CommentOptions.DuplicateWindowHours"/>), or when a reader has fewer
/// than <see cref="CommentOptions.PremoderateFirst"/> published comments. An edit the spam filter
/// catches holds a published comment again. Readers report someone else's published comment once
/// each; <see cref="CommentOptions.ReportsToHold"/> reports since its last moderation hold it. A hidden
/// comment, or one held and not the caller's, is listed like a deleted one: only while a reply hangs on
/// it, without author or text. A user a moderator barred (<see cref="CommentBan"/>) neither writes nor
/// edits comments. The queues, the decisions and the bans are <see cref="CommentModerationService"/>.
/// </para>
/// </remarks>
public sealed class ArticleCommentService
{
    /// <summary>Top-level comments per page when the request gives none.</summary>
    public const int DefaultPageSize = 20;

    /// <summary>The largest page, in top-level comments.</summary>
    public const int MaxPageSize = 50;

    private readonly MktbaDbContext _db;
    private readonly TimeProvider _clock;
    private readonly CommentOptions _options;
    private readonly ILogger<ArticleCommentService> _logger;

    public ArticleCommentService(MktbaDbContext db, TimeProvider clock, IOptions<CommentOptions> options, ILogger<ArticleCommentService> logger)
    {
        _db = db;
        _clock = clock;
        _options = options.Value;
        _logger = logger;
    }

    /// <summary>One page of the article's comments as <paramref name="userId"/> (null: anonymous) sees them.</summary>
    /// <exception cref="NotFoundException">No such article readers are served (article_not_found).</exception>
    public async Task<ArticleCommentPageDto> ListAsync(int articleId, int? userId, int page, int pageSize, CancellationToken cancellationToken)
    {
        await RequireArticleAsync(articleId, cancellationToken);
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);
        var caller = await CallerAsync(userId, cancellationToken);

        var shape = await _db.ArticleComments.AsNoTracking()
            .Where(comment => comment.ArticleId == articleId)
            .Select(comment => new CommentShape(comment.Id, comment.ParentId, comment.AuthorId, comment.Status, comment.DeletedAt != null, comment.CreatedAt))
            .ToListAsync(cancellationToken);
        var listed = Listed(shape, caller?.Id);
        var children = shape.Where(comment => comment.ParentId is not null && listed.Contains(comment.Id))
            .GroupBy(comment => comment.ParentId!.Value)
            .ToDictionary(group => group.Key, group => group.OrderBy(c => c.CreatedAt).ThenBy(c => c.Id).Select(c => c.Id).ToList());
        var roots = shape.Where(comment => comment.ParentId is null && listed.Contains(comment.Id))
            .OrderBy(comment => comment.CreatedAt).ThenBy(comment => comment.Id)
            .Select(comment => comment.Id)
            .ToList();

        var order = new List<int>();
        foreach (var rootId in roots.Skip((page - 1) * pageSize).Take(pageSize))
        {
            AppendTree(rootId, children, order);
        }

        var rows = await _db.ArticleComments.AsNoTracking()
            .Where(comment => order.Contains(comment.Id))
            .Select(comment => new CommentRow(
                comment.Id,
                comment.ParentId,
                comment.AuthorId,
                comment.Author != null ? comment.Author.DisplayName : null,
                comment.Body,
                comment.Status,
                comment.DeletedAt != null,
                comment.CreatedAt,
                comment.EditedAt))
            .ToDictionaryAsync(row => row.Id, cancellationToken);

        return new ArticleCommentPageDto(
            order.Select(id => ToDto(rows[id], caller)).ToList(),
            shape.Count(comment => !comment.Deleted && comment.Status == ArticleCommentStatus.Published),
            roots.Count,
            page,
            pageSize,
            Viewer(caller));
    }

    /// <summary>A new comment of <paramref name="userId"/> on the article, or a reply to one of its comments.</summary>
    /// <exception cref="ValidationException">No text, or too long.</exception>
    /// <exception cref="NotFoundException">No such article readers are served, or the parent is not one of its comments.</exception>
    /// <exception cref="ConflictException">The email is not confirmed, there is no display name, or the parent is deleted or hidden.</exception>
    /// <exception cref="ForbiddenException">The caller is barred from commenting (comment_banned).</exception>
    /// <exception cref="TooManyRequestsException">The account's limit is used up (comment_limit_reached).</exception>
    public async Task<ArticleCommentDto> CreateAsync(int articleId, int userId, ArticleCommentCreateDto dto, CancellationToken cancellationToken)
    {
        // Before any validation: a bot must not learn from a 400 that the trap is what gave it away.
        if (!string.IsNullOrWhiteSpace(dto.Website))
        {
            _logger.LogInformation("Comment dropped: the trap field was filled in.");
            var trappedAt = _clock.GetUtcNow().UtcDateTime;
            return new ArticleCommentDto(0, dto.ParentId, null, Clean(dto.Body) ?? string.Empty, false, false, false, true, false, false, false, trappedAt, null);
        }

        var body = Body(dto.Body);
        await RequireArticleAsync(articleId, cancellationToken);
        var caller = await CallerAsync(userId, cancellationToken) ?? throw new NotFoundException(AppErrors.ArticleNotFound);
        switch (Viewer(caller).Block)
        {
            case ArticleCommentBlock.EmailNotConfirmed:
                throw new ConflictException(AppErrors.EmailNotConfirmed);
            case ArticleCommentBlock.Banned:
                throw new ForbiddenException(AppErrors.CommentBanned(caller.BannedUntil));
            case ArticleCommentBlock.DisplayNameRequired:
                throw new ConflictException(AppErrors.CommentDisplayNameRequired);
        }

        if (dto.ParentId is int parentId)
        {
            var parent = await _db.ArticleComments.AsNoTracking()
                .Where(comment => comment.Id == parentId && comment.ArticleId == articleId)
                .Select(comment => new { Deleted = comment.DeletedAt != null, comment.Status, comment.AuthorId })
                .FirstOrDefaultAsync(cancellationToken);
            // A comment held for a moderator is not there for anyone but its author.
            if (parent is null || (parent.Status == ArticleCommentStatus.Pending && parent.AuthorId != userId))
            {
                throw new NotFoundException(AppErrors.CommentNotFound);
            }

            if (parent.Deleted)
            {
                throw new ConflictException(AppErrors.CommentDeleted);
            }

            if (parent.Status == ArticleCommentStatus.Hidden)
            {
                throw new ConflictException(AppErrors.CommentHidden);
            }
        }

        var now = _clock.GetUtcNow().UtcDateTime;
        await EnforceUserLimitAsync(userId, now, cancellationToken);
        var hold = await HoldReasonAsync(caller, body, now, cancellationToken);

        var created = new ArticleComment
        {
            ArticleId = articleId,
            AuthorId = userId,
            ParentId = dto.ParentId,
            Body = body,
            CreatedAt = now,
            Status = hold is null ? ArticleCommentStatus.Published : ArticleCommentStatus.Pending,
            HoldReason = hold,
        };
        _db.ArticleComments.Add(created);
        // C-05 (#131) adds the reply notification to the parent's author here, in this same save.
        await _db.SaveChangesAsync(cancellationToken);
        if (hold is not null)
        {
            _logger.LogInformation("Comment {CommentId} held for moderation: {Reason}.", created.Id, hold);
        }

        return ToDto(new CommentRow(created.Id, created.ParentId, userId, caller.DisplayName, body, created.Status, false, now, null), caller);
    }

    /// <summary>The new text of <paramref name="userId"/>'s own comment.</summary>
    /// <exception cref="ValidationException">No text, or too long.</exception>
    /// <exception cref="NotFoundException">No such comment on an article readers are served.</exception>
    /// <exception cref="ForbiddenException">Someone else's comment, or the caller is barred from commenting.</exception>
    /// <exception cref="ConflictException">The comment is deleted or hidden.</exception>
    public async Task<ArticleCommentDto> UpdateAsync(int commentId, int userId, ArticleCommentUpdateDto dto, CancellationToken cancellationToken)
    {
        var body = Body(dto.Body);
        var comment = await RequireCommentAsync(commentId, cancellationToken);
        var caller = await CallerAsync(userId, cancellationToken) ?? throw new NotFoundException(AppErrors.CommentNotFound);
        if (comment.DeletedAt is not null)
        {
            throw new ConflictException(AppErrors.CommentDeleted);
        }

        if (comment.AuthorId != userId)
        {
            throw new ForbiddenException(AppErrors.Forbidden);
        }

        if (comment.Status == ArticleCommentStatus.Hidden)
        {
            throw new ConflictException(AppErrors.CommentHidden);
        }

        if (caller.Banned)
        {
            throw new ForbiddenException(AppErrors.CommentBanned(caller.BannedUntil));
        }

        if (comment.Body != body)
        {
            comment.Body = body;
            comment.EditedAt = _clock.GetUtcNow().UtcDateTime;
            if (comment.Status == ArticleCommentStatus.Published && caller.Role != UserRole.Admin && CommentSpamFilter.IsSpam(body, _options))
            {
                comment.Status = ArticleCommentStatus.Pending;
                comment.HoldReason = ArticleCommentHoldReason.Spam;
                _logger.LogInformation("Comment {CommentId} held for moderation after an edit: {Reason}.", comment.Id, comment.HoldReason);
            }

            await _db.SaveChangesAsync(cancellationToken);
        }

        return ToDto(new CommentRow(comment.Id, comment.ParentId, userId, caller.DisplayName, comment.Body, comment.Status, false, comment.CreatedAt, comment.EditedAt), caller);
    }

    /// <summary>
    /// Deletes a comment softly: its author, or an admin. The text is erased; replies stay. Deleting a
    /// deleted comment again changes nothing.
    /// </summary>
    /// <exception cref="NotFoundException">No such comment on an article readers are served.</exception>
    /// <exception cref="ForbiddenException">Someone else's comment and the caller is not an admin.</exception>
    public async Task DeleteAsync(int commentId, int userId, CancellationToken cancellationToken)
    {
        var comment = await RequireCommentAsync(commentId, cancellationToken);
        var caller = await CallerAsync(userId, cancellationToken) ?? throw new NotFoundException(AppErrors.CommentNotFound);
        if (comment.AuthorId != userId && caller.Role != UserRole.Admin)
        {
            throw new ForbiddenException(AppErrors.Forbidden);
        }

        if (comment.DeletedAt is not null)
        {
            return;
        }

        comment.DeletedAt = _clock.GetUtcNow().UtcDateTime;
        comment.DeletedById = userId;
        comment.Body = string.Empty;
        await _db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Reports someone else's published comment (C-02, #128), once per reader. Enough reports since its
    /// last moderation hold it for a moderator.
    /// </summary>
    /// <exception cref="ValidationException">No reason, or the note is too long.</exception>
    /// <exception cref="NotFoundException">No such comment the caller can see on an article readers are served.</exception>
    /// <exception cref="ForbiddenException">The caller's own comment.</exception>
    /// <exception cref="ConflictException">The email is not confirmed, the comment is deleted or hidden, or the caller has reported it already.</exception>
    public async Task ReportAsync(int commentId, int userId, ArticleCommentReportCreateDto dto, CancellationToken cancellationToken)
    {
        var reason = dto.Reason is ArticleCommentReportReason value && Enum.IsDefined(value)
            ? value
            : throw new ValidationException(AppErrors.CommentReportReasonRequired);
        var note = Clean(dto.Note);
        if (note?.Length > ArticleCommentReport.NoteMaxLength)
        {
            throw new ValidationException(AppErrors.CommentReportNoteTooLong(ArticleCommentReport.NoteMaxLength));
        }

        var comment = await RequireCommentAsync(commentId, cancellationToken);
        var caller = await CallerAsync(userId, cancellationToken) ?? throw new NotFoundException(AppErrors.CommentNotFound);
        if (comment.Status == ArticleCommentStatus.Pending && comment.AuthorId != userId)
        {
            throw new NotFoundException(AppErrors.CommentNotFound);
        }

        if (!caller.EmailConfirmed)
        {
            throw new ConflictException(AppErrors.EmailNotConfirmed);
        }

        if (comment.AuthorId == userId)
        {
            throw new ForbiddenException(AppErrors.Forbidden);
        }

        if (comment.DeletedAt is not null)
        {
            throw new ConflictException(AppErrors.CommentDeleted);
        }

        if (comment.Status == ArticleCommentStatus.Hidden)
        {
            throw new ConflictException(AppErrors.CommentHidden);
        }

        if (await _db.ArticleCommentReports.AnyAsync(report => report.CommentId == commentId && report.ReporterId == userId, cancellationToken))
        {
            throw new ConflictException(AppErrors.CommentAlreadyReported);
        }

        var moderatedAt = comment.ModeratedAt;
        var open = await _db.ArticleCommentReports.CountAsync(
            report => report.CommentId == commentId && (moderatedAt == null || report.CreatedAt > moderatedAt),
            cancellationToken);
        _db.ArticleCommentReports.Add(new ArticleCommentReport
        {
            CommentId = commentId,
            ReporterId = userId,
            Reason = reason,
            Note = note,
            CreatedAt = _clock.GetUtcNow().UtcDateTime,
        });
        if (_options.ReportsToHold > 0 && open + 1 >= _options.ReportsToHold)
        {
            comment.Status = ArticleCommentStatus.Pending;
            comment.HoldReason = ArticleCommentHoldReason.Reported;
            _logger.LogInformation("Comment {CommentId} held for moderation: {Reason}.", comment.Id, comment.HoldReason);
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>The text as comments store it (see <see cref="Clean"/>); the moderators' notes are kept the same way.</summary>
    internal static string? CleanText(string? value) => Clean(value);

    /// <summary>Why a new comment of <paramref name="caller"/> is held for a moderator; null: it is published.</summary>
    private async Task<ArticleCommentHoldReason?> HoldReasonAsync(Caller caller, string body, DateTime now, CancellationToken cancellationToken)
    {
        if (caller.Role == UserRole.Admin)
        {
            return null;
        }

        if (CommentSpamFilter.IsSpam(body, _options))
        {
            return ArticleCommentHoldReason.Spam;
        }

        if (_options.DuplicateWindowHours > 0)
        {
            var since = now - TimeSpan.FromHours(_options.DuplicateWindowHours);
            if (await _db.ArticleComments.AsNoTracking().AnyAsync(
                    comment => comment.AuthorId == caller.Id && comment.CreatedAt > since && comment.DeletedAt == null && comment.Body == body,
                    cancellationToken))
            {
                return ArticleCommentHoldReason.Spam;
            }
        }

        if (caller.Role == UserRole.Reader && _options.PremoderateFirst > 0)
        {
            var published = await _db.ArticleComments.AsNoTracking()
                .Where(comment => comment.AuthorId == caller.Id && comment.Status == ArticleCommentStatus.Published)
                .Take(_options.PremoderateFirst)
                .CountAsync(cancellationToken);
            if (published < _options.PremoderateFirst)
            {
                return ArticleCommentHoldReason.NewAuthor;
            }
        }

        return null;
    }

    private sealed record Caller(int Id, UserRole Role, string? DisplayName, bool EmailConfirmed, bool Banned, DateTime? BannedUntil);

    private sealed record CommentShape(int Id, int? ParentId, int? AuthorId, ArticleCommentStatus Status, bool Deleted, DateTime CreatedAt);

    private sealed record CommentRow(
        int Id, int? ParentId, int? AuthorId, string? AuthorName, string Body, ArticleCommentStatus Status, bool Deleted, DateTime CreatedAt, DateTime? EditedAt);

    private async Task<Caller?> CallerAsync(int? userId, CancellationToken cancellationToken)
    {
        if (userId is not int id)
        {
            return null;
        }

        var user = await _db.Users.AsNoTracking()
            .Where(user => user.Id == id)
            .Select(user => new { user.Id, user.Role, user.DisplayName, Confirmed = user.EmailConfirmedAtUtc != null })
            .FirstOrDefaultAsync(cancellationToken);
        if (user is null)
        {
            return null;
        }

        var now = _clock.GetUtcNow().UtcDateTime;
        var ban = await _db.CommentBans.AsNoTracking()
            .Where(ban => ban.UserId == id && (ban.Until == null || ban.Until > now))
            .Select(ban => new { ban.Until })
            .FirstOrDefaultAsync(cancellationToken);
        return new Caller(user.Id, user.Role, user.DisplayName, user.Confirmed, ban is not null, ban?.Until);
    }

    private static ArticleCommentViewerDto Viewer(Caller? caller)
    {
        ArticleCommentBlock? block = caller is null ? ArticleCommentBlock.SignInRequired
            : !caller.EmailConfirmed ? ArticleCommentBlock.EmailNotConfirmed
            : caller.Banned ? ArticleCommentBlock.Banned
            : string.IsNullOrWhiteSpace(caller.DisplayName) ? ArticleCommentBlock.DisplayNameRequired
            : null;
        return new ArticleCommentViewerDto(block is null, block, block == ArticleCommentBlock.Banned ? caller!.BannedUntil : null);
    }

    /// <summary>Whether <paramref name="callerId"/> sees the comment itself rather than a placeholder.</summary>
    private static bool Visible(ArticleCommentStatus status, bool deleted, int? authorId, int? callerId) =>
        !deleted && (status == ArticleCommentStatus.Published
            || (status == ArticleCommentStatus.Pending && callerId is not null && authorId == callerId));

    private static ArticleCommentDto ToDto(CommentRow row, Caller? caller)
    {
        if (!Visible(row.Status, row.Deleted, row.AuthorId, caller?.Id))
        {
            return new ArticleCommentDto(row.Id, row.ParentId, null, null, row.Deleted, !row.Deleted, false, false, false, false, false, row.CreatedAt, null);
        }

        var mine = caller is not null && row.AuthorId == caller.Id;
        return new ArticleCommentDto(
            row.Id,
            row.ParentId,
            string.IsNullOrWhiteSpace(row.AuthorName) ? null : row.AuthorName,
            row.Body,
            false,
            false,
            row.Status == ArticleCommentStatus.Pending,
            mine,
            mine && !caller!.Banned,
            mine || caller?.Role == UserRole.Admin,
            caller is not null && !mine && row.Status == ArticleCommentStatus.Published,
            row.CreatedAt,
            row.EditedAt);
    }

    /// <summary>
    /// The comments the list shows to <paramref name="callerId"/>: every comment they may see (published,
    /// or their own held for a moderator), and any other — deleted, hidden, held — while a listed reply
    /// hangs on it. A reply is always newer than its parent, so walking from the newest sees every
    /// reply before the comment it answers.
    /// </summary>
    private static HashSet<int> Listed(IReadOnlyList<CommentShape> shape, int? callerId)
    {
        var listed = new HashSet<int>();
        var answered = new HashSet<int>();
        foreach (var comment in shape.OrderByDescending(c => c.Id))
        {
            if (Visible(comment.Status, comment.Deleted, comment.AuthorId, callerId) || answered.Contains(comment.Id))
            {
                listed.Add(comment.Id);
                if (comment.ParentId is int parentId)
                {
                    answered.Add(parentId);
                }
            }
        }

        return listed;
    }

    private static void AppendTree(int rootId, IReadOnlyDictionary<int, List<int>> children, List<int> order)
    {
        var stack = new Stack<int>();
        stack.Push(rootId);
        while (stack.Count > 0)
        {
            var id = stack.Pop();
            order.Add(id);
            if (children.TryGetValue(id, out var replies))
            {
                for (var i = replies.Count - 1; i >= 0; i--)
                {
                    stack.Push(replies[i]);
                }
            }
        }
    }

    private async Task RequireArticleAsync(int articleId, CancellationToken cancellationToken)
    {
        if (!await _db.Articles.AsNoTracking().AnyAsync(
                article => article.Id == articleId && article.Status == ArticleStatus.Published && article.DeletedAt == null,
                cancellationToken))
        {
            throw new NotFoundException(AppErrors.ArticleNotFound);
        }
    }

    private async Task<ArticleComment> RequireCommentAsync(int commentId, CancellationToken cancellationToken) =>
        await _db.ArticleComments
            .Where(comment => comment.Id == commentId
                && comment.Article.Status == ArticleStatus.Published
                && comment.Article.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken)
        ?? throw new NotFoundException(AppErrors.CommentNotFound);

    private async Task EnforceUserLimitAsync(int userId, DateTime now, CancellationToken cancellationToken)
    {
        var limit = _options.PerUserLimit;
        if (limit <= 0)
        {
            return;
        }

        var window = TimeSpan.FromSeconds(Math.Max(_options.PerUserWindowSeconds, 1));
        var since = now - window;
        var recent = await _db.ArticleComments.AsNoTracking()
            .Where(comment => comment.AuthorId == userId && comment.CreatedAt > since)
            .OrderByDescending(comment => comment.CreatedAt)
            .Select(comment => comment.CreatedAt)
            .Take(limit)
            .ToListAsync(cancellationToken);
        if (recent.Count >= limit)
        {
            throw new TooManyRequestsException(AppErrors.CommentLimitReached, recent[^1] + window - now);
        }
    }

    private static string Body(string? value)
    {
        var body = Clean(value) ?? throw new ValidationException(AppErrors.CommentBodyRequired);
        if (body.Length > ArticleComment.BodyMaxLength)
        {
            throw new ValidationException(AppErrors.CommentBodyTooLong(ArticleComment.BodyMaxLength));
        }

        return body;
    }

    /// <summary>
    /// The text as it is stored: line breaks as "\n", without control characters (PostgreSQL refuses
    /// U+0000), unpaired surrogates and the bidirectional overrides and isolates that could make the
    /// text read differently from how it is stored; trimmed; null when nothing is left.
    /// </summary>
    private static string? Clean(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var text = value.Replace("\r\n", "\n").Replace('\r', '\n');
        var builder = new StringBuilder(text.Length);
        for (var i = 0; i < text.Length; i++)
        {
            var current = text[i];
            if (char.IsHighSurrogate(current) && i + 1 < text.Length && char.IsLowSurrogate(text[i + 1]))
            {
                builder.Append(current).Append(text[++i]);
            }
            else if (current is '\n' or '\t')
            {
                builder.Append(current);
            }
            else if (!char.IsSurrogate(current) && !char.IsControl(current) && !IsBidiControl(current))
            {
                builder.Append(current);
            }
        }

        var cleaned = builder.ToString().Trim();
        return cleaned.Length == 0 ? null : cleaned;
    }

    private static bool IsBidiControl(char value) => value is (>= '‪' and <= '‮') or (>= '⁦' and <= '⁩');
}
