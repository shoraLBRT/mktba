using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services;

/// <summary>
/// Reads the audit log (U-09, #135). The entries themselves are written by the services that perform
/// the actions (<see cref="ArticleService"/>, <see cref="UserAdminService"/>), each in its own save.
/// </summary>
public class AuditLogService
{
    /// <summary>The largest page of the audit log.</summary>
    public const int MaxPageSize = 100;

    /// <summary>The page size when the request gives none.</summary>
    public const int DefaultPageSize = 50;

    private readonly AuditLogRepository _auditLog;

    public AuditLogService(AuditLogRepository auditLog)
    {
        _auditLog = auditLog;
    }

    /// <summary>
    /// One page of the entries matching the filters, newest first. A page below 1 is the first, the
    /// page size is kept within 1 to <see cref="MaxPageSize"/>; a page past the end is empty. Users and
    /// articles are shown as they are now: a deleted user has no name, a trashed or purged article is
    /// not <see cref="AuditLogEntryDto.ArticleAvailable"/> (its title at the time stays).
    /// </summary>
    public async Task<AuditLogPageDto> GetPageAsync(
        AuditAction? action,
        int? actorId,
        int? articleId,
        int? targetUserId,
        int page = 1,
        int pageSize = DefaultPageSize,
        CancellationToken cancellationToken = default)
    {
        var query = new AuditLogQuery(
            action, actorId, articleId, targetUserId, Math.Max(page, 1), Math.Clamp(pageSize, 1, MaxPageSize));
        var (entries, total) = await _auditLog.GetPageAsync(query, cancellationToken);

        var userIds = entries.SelectMany(entry => new[] { entry.ActorId, entry.TargetUserId })
            .OfType<int>().Distinct().ToList();
        var users = userIds.Count == 0
            ? new Dictionary<int, AuditLogUserRow>()
            : await _auditLog.GetUsersAsync(userIds, cancellationToken);
        var articleIds = entries.Select(entry => entry.ArticleId).OfType<int>().Distinct().ToList();
        var liveArticles = articleIds.Count == 0
            ? new HashSet<int>()
            : await _auditLog.GetLiveArticleIdsAsync(articleIds, cancellationToken);

        AuditLogUserDto? UserOf(int? id) => id is int userId && users.TryGetValue(userId, out var user)
            ? new AuditLogUserDto { Id = user.Id, Email = user.Email, DisplayName = user.DisplayName }
            : null;

        return new AuditLogPageDto
        {
            Items = entries.Select(entry => new AuditLogEntryDto
            {
                Id = entry.Id,
                OccurredAt = entry.OccurredAt,
                Action = entry.Action,
                ActorId = entry.ActorId,
                Actor = UserOf(entry.ActorId),
                ArticleId = entry.ArticleId,
                ArticleTitle = entry.ArticleTitle,
                ArticleAvailable = entry.ArticleId is int id && liveArticles.Contains(id),
                TargetUserId = entry.TargetUserId,
                TargetUser = UserOf(entry.TargetUserId),
                FromValue = entry.FromValue,
                ToValue = entry.ToValue,
            }).ToList(),
            Total = total,
            Page = query.Page,
            PageSize = query.PageSize,
        };
    }
}
