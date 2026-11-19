using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services;

/// <summary>
/// Admin side of invites (U-04, #32): create one for a role, list them with their status, revoke an
/// unused one. Registering with an invite is <see cref="AdminAuthService.RegisterAsync"/>.
/// </summary>
public class InviteService
{
    /// <summary>The longest lifetime an admin may give an invite: 30 days.</summary>
    public const int MaxLifetimeHours = 24 * 30;

    private readonly InviteRepository _invites;
    private readonly TimeProvider _clock;
    private readonly AuthOptions _authOptions;

    public InviteService(InviteRepository invites, TimeProvider clock, IOptions<AuthOptions> authOptions)
    {
        _invites = invites;
        _clock = clock;
        _authOptions = authOptions.Value;
    }

    /// <summary>A new invite for the requested role; the raw token is returned once and never stored.</summary>
    public async Task<InviteCreatedDto> CreateAsync(int createdByUserId, InviteCreateRequestDto request)
    {
        if (!Enum.IsDefined(request.Role))
        {
            throw new ValidationException(AppErrors.RoleInvalid);
        }

        var lifetimeHours = request.LifetimeHours ?? _authOptions.InviteTokenLifetimeHours;
        if (lifetimeHours < 1 || lifetimeHours > MaxLifetimeHours)
        {
            throw new ValidationException(AppErrors.InviteLifetimeInvalid(MaxLifetimeHours));
        }

        var note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        if (note?.Length > Invite.NoteMaxLength)
        {
            throw new ValidationException(AppErrors.InviteNoteTooLong(Invite.NoteMaxLength));
        }

        var rawToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var nowUtc = _clock.GetUtcNow().UtcDateTime;
        var invite = new Invite
        {
            TokenHash = SessionService.HashToken(rawToken),
            Role = request.Role,
            Note = note,
            CreatedAtUtc = nowUtc,
            ExpiresAtUtc = nowUtc.AddHours(lifetimeHours),
            CreatedByUserId = createdByUserId,
        };

        await _invites.AddAsync(invite);
        await _invites.SaveChangesAsync();

        return new InviteCreatedDto { Id = invite.Id, Token = rawToken, Role = invite.Role, ExpiresAtUtc = invite.ExpiresAtUtc };
    }

    /// <summary>Every invite, newest first, with its status now.</summary>
    public async Task<List<InviteDto>> ListAsync(CancellationToken cancellationToken = default)
    {
        var nowUtc = _clock.GetUtcNow().UtcDateTime;
        return (await _invites.ListNewestFirstAsync(cancellationToken))
            .Select(invite => new InviteDto
            {
                Id = invite.Id,
                Role = invite.Role,
                Note = invite.Note,
                Status = invite.StatusAt(nowUtc),
                CreatedAtUtc = invite.CreatedAtUtc,
                ExpiresAtUtc = invite.ExpiresAtUtc,
                UsedAtUtc = invite.UsedAtUtc,
                RevokedAtUtc = invite.RevokedAtUtc,
                CreatedByEmail = invite.CreatedByUser.Email,
                UsedByEmail = invite.UsedByUser?.Email,
            })
            .ToList();
    }

    /// <summary>
    /// Withdraws an unused invite so nobody can register with it. Revoking a revoked or expired invite
    /// changes nothing; a used invite cannot be revoked (the user exists: change their role instead).
    /// </summary>
    public async Task RevokeAsync(int id)
    {
        var invite = await _invites.GetByIdAsync(id)
            ?? throw new NotFoundException(AppErrors.InviteNotFound);
        if (invite.UsedAtUtc.HasValue)
        {
            throw new ValidationException(AppErrors.InviteUsed);
        }

        if (invite.RevokedAtUtc.HasValue)
        {
            return;
        }

        invite.RevokedAtUtc = _clock.GetUtcNow().UtcDateTime;
        try
        {
            await _invites.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            // Someone registered with the invite between the read and the update.
            throw new ValidationException(AppErrors.InviteUsed);
        }
    }
}
