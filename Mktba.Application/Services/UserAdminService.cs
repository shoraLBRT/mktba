using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services;

/// <summary>Admin management of existing users (U-04, #32): changing a user's role.</summary>
public class UserAdminService
{
    private readonly UserRepository _users;

    public UserAdminService(UserRepository users)
    {
        _users = users;
    }

    /// <summary>
    /// Gives user <paramref name="userId"/> <paramref name="role"/>. The change applies from their next
    /// request, since the role is read from the database every time. The last admin cannot be given
    /// another role, so the platform never loses its last administrator.
    /// </summary>
    public async Task<UserSummaryDto> ChangeRoleAsync(int userId, UserRole role, CancellationToken cancellationToken = default)
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

        user.Role = role;
        await _users.SaveChangesAsync();
        return new UserSummaryDto { Id = user.Id, Email = user.Email, Role = user.Role };
    }
}
