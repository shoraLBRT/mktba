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
            .Select(comment => new CommentShape(comment.Id, comment.ParentId, comment.DeletedAt != null, comment.CreatedAt))
            .ToListAsync(cancellationToken);
        var listed = Listed(shape);
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
                comment.DeletedAt != null,
                comment.CreatedAt,
                comment.EditedAt))
            .ToDictionaryAsync(row => row.Id, cancellationToken);

        return new ArticleCommentPageDto(
            order.Select(id => ToDto(rows[id], caller)).ToList(),
            shape.Count(comment => !comment.Deleted),
            roots.Count,
            page,
            pageSize,
            Viewer(caller));
    }

    /// <summary>A new comment of <paramref name="userId"/> on the article, or a reply to one of its comments.</summary>
    /// <exception cref="ValidationException">No text, or too long.</exception>
    /// <exception cref="NotFoundException">No such article readers are served, or the parent is not one of its comments.</exception>
    /// <exception cref="ConflictException">The email is not confirmed, there is no display name, or the parent is deleted.</exception>
    /// <exception cref="TooManyRequestsException">The account's limit is used up (comment_limit_reached).</exception>
    public async Task<ArticleCommentDto> CreateAsync(int articleId, int userId, ArticleCommentCreateDto dto, CancellationToken cancellationToken)
    {
        // Before any validation: a bot must not learn from a 400 that the trap is what gave it away.
        if (!string.IsNullOrWhiteSpace(dto.Website))
        {
            _logger.LogInformation("Comment dropped: the trap field was filled in.");
            var trappedAt = _clock.GetUtcNow().UtcDateTime;
            return new ArticleCommentDto(0, dto.ParentId, null, Clean(dto.Body) ?? string.Empty, false, true, false, false, trappedAt, null);
        }

        var body = Body(dto.Body);
        await RequireArticleAsync(articleId, cancellationToken);
        var caller = await CallerAsync(userId, cancellationToken) ?? throw new NotFoundException(AppErrors.ArticleNotFound);
        if (Viewer(caller).Block is ArticleCommentBlock block)
        {
            throw new ConflictException(block == ArticleCommentBlock.EmailNotConfirmed
                ? AppErrors.EmailNotConfirmed
                : AppErrors.CommentDisplayNameRequired);
        }

        if (dto.ParentId is int parentId)
        {
            var parent = await _db.ArticleComments.AsNoTracking()
                .Where(comment => comment.Id == parentId && comment.ArticleId == articleId)
                .Select(comment => new { Deleted = comment.DeletedAt != null })
                .FirstOrDefaultAsync(cancellationToken)
                ?? throw new NotFoundException(AppErrors.CommentNotFound);
            if (parent.Deleted)
            {
                throw new ConflictException(AppErrors.CommentDeleted);
            }
        }

        var now = _clock.GetUtcNow().UtcDateTime;
        await EnforceUserLimitAsync(userId, now, cancellationToken);

        var created = new ArticleComment
        {
            ArticleId = articleId,
            AuthorId = userId,
            ParentId = dto.ParentId,
            Body = body,
            CreatedAt = now,
        };
        _db.ArticleComments.Add(created);
        // C-05 (#131) adds the reply notification to the parent's author here, in this same save.
        await _db.SaveChangesAsync(cancellationToken);
        return ToDto(new CommentRow(created.Id, created.ParentId, userId, caller.DisplayName, body, false, now, null), caller);
    }

    /// <summary>The new text of <paramref name="userId"/>'s own comment.</summary>
    /// <exception cref="ValidationException">No text, or too long.</exception>
    /// <exception cref="NotFoundException">No such comment on an article readers are served.</exception>
    /// <exception cref="ForbiddenException">Someone else's comment.</exception>
    /// <exception cref="ConflictException">The comment is deleted.</exception>
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

        if (comment.Body != body)
        {
            comment.Body = body;
            comment.EditedAt = _clock.GetUtcNow().UtcDateTime;
            await _db.SaveChangesAsync(cancellationToken);
        }

        return ToDto(new CommentRow(comment.Id, comment.ParentId, userId, caller.DisplayName, comment.Body, false, comment.CreatedAt, comment.EditedAt), caller);
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

    private sealed record Caller(int Id, UserRole Role, string? DisplayName, bool EmailConfirmed);

    private sealed record CommentShape(int Id, int? ParentId, bool Deleted, DateTime CreatedAt);

    private sealed record CommentRow(
        int Id, int? ParentId, int? AuthorId, string? AuthorName, string Body, bool Deleted, DateTime CreatedAt, DateTime? EditedAt);

    private async Task<Caller?> CallerAsync(int? userId, CancellationToken cancellationToken) =>
        userId is int id
            ? await _db.Users.AsNoTracking()
                .Where(user => user.Id == id)
                .Select(user => new Caller(user.Id, user.Role, user.DisplayName, user.EmailConfirmedAtUtc != null))
                .FirstOrDefaultAsync(cancellationToken)
            : null;

    private static ArticleCommentViewerDto Viewer(Caller? caller)
    {
        ArticleCommentBlock? block = caller is null ? ArticleCommentBlock.SignInRequired
            : !caller.EmailConfirmed ? ArticleCommentBlock.EmailNotConfirmed
            : string.IsNullOrWhiteSpace(caller.DisplayName) ? ArticleCommentBlock.DisplayNameRequired
            : null;
        return new ArticleCommentViewerDto(block is null, block);
    }

    private static ArticleCommentDto ToDto(CommentRow row, Caller? caller)
    {
        var mine = caller is not null && row.AuthorId == caller.Id;
        return row.Deleted
            ? new ArticleCommentDto(row.Id, row.ParentId, null, null, true, false, false, false, row.CreatedAt, null)
            : new ArticleCommentDto(
                row.Id,
                row.ParentId,
                string.IsNullOrWhiteSpace(row.AuthorName) ? null : row.AuthorName,
                row.Body,
                false,
                mine,
                mine,
                mine || caller?.Role == UserRole.Admin,
                row.CreatedAt,
                row.EditedAt);
    }

    /// <summary>
    /// The comments the list shows: every comment that is not deleted, and a deleted one while a
    /// listed reply hangs on it. A reply is always newer than its parent, so walking from the newest
    /// sees every reply before the comment it answers.
    /// </summary>
    private static HashSet<int> Listed(IReadOnlyList<CommentShape> shape)
    {
        var listed = new HashSet<int>();
        var answered = new HashSet<int>();
        foreach (var comment in shape.OrderByDescending(c => c.Id))
        {
            if (!comment.Deleted || answered.Contains(comment.Id))
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
