using Mktba.Application.Exceptions;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services;

public class AdminAuthService
{
    private readonly UserRepository _userRepository;
    private readonly InviteRepository _invites;
    private readonly SessionService _sessionService;
    private readonly TimeProvider _clock;
    private readonly PasswordHasher<User> _passwordHasher = new();

    public AdminAuthService(
        UserRepository userRepository,
        InviteRepository invites,
        SessionService sessionService,
        TimeProvider clock)
    {
        _userRepository = userRepository;
        _invites = invites;
        _sessionService = sessionService;
        _clock = clock;
    }

    public async Task<AdminAuthStatusDto> GetAuthStatusAsync(CancellationToken cancellationToken = default)
    {
        var hasAdmins = await _userRepository.AnyAsync(cancellationToken);
        return new AdminAuthStatusDto { RequiresBootstrapAdmin = !hasAdmins };
    }

    /// <summary>The user with <paramref name="userId"/>, or null when it no longer exists.</summary>
    public async Task<CurrentUserDto?> GetCurrentUserAsync(int userId, CancellationToken cancellationToken = default)
    {
        var user = await _userRepository.FindReadOnlyAsync(userId, cancellationToken);
        return user is null ? null : new CurrentUserDto { Id = user.Id, Email = user.Email, Role = user.Role };
    }

    public async Task<AdminService.ServiceResult<IssuedSession>> RegisterAsync(
        AdminRegisterRequestDto request,
        SessionClient client,
        CancellationToken cancellationToken = default)
    {
        var normalizedEmail = NormalizeEmail(request.Email);
        if (string.IsNullOrWhiteSpace(normalizedEmail) || string.IsNullOrWhiteSpace(request.Password))
        {
            return AdminService.ServiceResult<IssuedSession>.Failure(AppErrors.EmailAndPasswordRequired);
        }

        if (PasswordRules.Check(request.Password, normalizedEmail) is { } passwordError)
        {
            return AdminService.ServiceResult<IssuedSession>.Failure(passwordError);
        }

        var alreadyExists = await _userRepository.ExistsByEmailAsync(normalizedEmail, cancellationToken);
        if (alreadyExists)
        {
            return AdminService.ServiceResult<IssuedSession>.Failure(AppErrors.AdminAlreadyExists);
        }

        var nowUtc = _clock.GetUtcNow().UtcDateTime;
        Invite? invite = null;
        if (await _userRepository.AnyAsync(cancellationToken))
        {
            invite = string.IsNullOrWhiteSpace(request.InviteToken)
                ? null
                : await _invites.GetByHashAsync(SessionService.HashToken(request.InviteToken.Trim()), cancellationToken);
            var inviteError = invite is null ? AppErrors.InviteNotFound : InviteError(invite.StatusAt(nowUtc));
            if (inviteError is not null)
            {
                return AdminService.ServiceResult<IssuedSession>.Failure(inviteError);
            }
        }

        // The first user bootstraps the platform as its admin; everyone else gets the invite's role.
        var user = new User { Email = normalizedEmail, Role = invite?.Role ?? UserRole.Admin };
        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);
        await _userRepository.AddAsync(user);

        if (invite is not null)
        {
            invite.UsedAtUtc = nowUtc;
            invite.UsedByUser = user;
        }

        try
        {
            // One SaveChanges, so one transaction: the user and the used invite are stored together. The
            // invite's update only matches while UsedAtUtc and RevokedAtUtc are still null (concurrency
            // tokens), so of two registrations racing for one invite only the first succeeds.
            await _userRepository.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return AdminService.ServiceResult<IssuedSession>.Failure(AppErrors.InviteUsed);
        }

        return AdminService.ServiceResult<IssuedSession>.Success(await _sessionService.StartAsync(user, client, cancellationToken));
    }

    public async Task<AdminService.ServiceResult<IssuedSession>> LoginAsync(
        AdminLoginRequestDto request,
        SessionClient client,
        CancellationToken cancellationToken = default)
    {
        var normalizedEmail = NormalizeEmail(request.Email);
        if (string.IsNullOrWhiteSpace(normalizedEmail) || string.IsNullOrWhiteSpace(request.Password))
        {
            return AdminService.ServiceResult<IssuedSession>.Failure(AppErrors.EmailAndPasswordRequired);
        }

        var user = await _userRepository.GetByEmailAsync(normalizedEmail, cancellationToken);
        if (user is null)
        {
            return AdminService.ServiceResult<IssuedSession>.Failure(AppErrors.InvalidCredentials);
        }

        var verificationResult = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verificationResult == PasswordVerificationResult.Failed)
        {
            return AdminService.ServiceResult<IssuedSession>.Failure(AppErrors.InvalidCredentials);
        }

        return AdminService.ServiceResult<IssuedSession>.Success(await _sessionService.StartAsync(user, client, cancellationToken));
    }

    /// <summary>Why an invite with <paramref name="status"/> cannot be used, or null when it can.</summary>
    private static AppError? InviteError(InviteStatus status) => status switch
    {
        InviteStatus.Active => null,
        InviteStatus.Used => AppErrors.InviteUsed,
        InviteStatus.Revoked => AppErrors.InviteRevoked,
        _ => AppErrors.InviteExpired,
    };

    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();
}
