using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services;

/// <summary>Admin management of existing users (U-04, #32): changing a user's role.</summary>
public class UserAdminService
{
    private readonly UserRepository _users;
    private readonly AuditLogRepository _auditLog;
    private readonly TimeProvider _clock;

    public UserAdminService(UserRepository users, AuditLogRepository auditLog, TimeProvider clock)
    {
        _users = users;
        _auditLog = auditLog;
        _clock = clock;
    }

    /// <summary>
    /// Gives user <paramref name="userId"/> <paramref name="role"/>. The change applies from their next
    /// request, since the role is read from the database every time. The last admin cannot be given
    /// another role, so the platform never loses its last administrator. A real change is an entry of
    /// the audit log (U-09, #135) in the same save; giving a user the role they already have is not.
    /// </summary>
    /// <param name="changedById">The admin making the change, recorded in the audit log.</param>
    public async Task<UserSummaryDto> ChangeRoleAsync(
        int userId, UserRole role, int? changedById = null, CancellationToken cancellationToken = default)
    {
        if (!Enum.IsDefined(role))
        {
            throw new ValidationException(AppErrors.RoleInvalid);
        }

        var user = await _users.GetByIdAsync(userId)
            ?? throw new NotFoundException(AppErrors.UserNotFound(userId));

        if (user.Role == UserRole.Admin && role != UserRole.Admin
            && await _users.CountByRoleAsync(UserRole.Admin, cancellationToken) <= 1)
        {
            throw new ValidationException(AppErrors.LastAdminDemotion);
        }

        if (user.Role != role)
        {
            _auditLog.Add(new AuditLogEntry
            {
                OccurredAt = _clock.GetUtcNow().UtcDateTime,
                ActorId = changedById,
                Action = AuditAction.UserRoleChanged,
                TargetUserId = user.Id,
                FromValue = user.Role.ToString(),
                ToValue = role.ToString(),
            });
        }

        user.Role = role;
        await _users.SaveChangesAsync();
        return new UserSummaryDto { Id = user.Id, Email = user.Email, DisplayName = user.DisplayName, Role = user.Role };
    }
}
