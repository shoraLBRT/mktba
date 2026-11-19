using Mktba.Application.Exceptions;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services;

public class AdminAuthService
{
    private readonly UserRepository _userRepository;
    private readonly AdminInviteTokenRepository _adminInviteTokenRepository;
    private readonly SessionService _sessionService;
    private readonly AuthOptions _authOptions;
    private readonly PasswordHasher<User> _passwordHasher = new();

    public AdminAuthService(
        UserRepository userRepository,
        AdminInviteTokenRepository adminInviteTokenRepository,
        SessionService sessionService,
        IOptions<AuthOptions> authOptions)
    {
        _userRepository = userRepository;
        _adminInviteTokenRepository = adminInviteTokenRepository;
        _sessionService = sessionService;
        _authOptions = authOptions.Value;
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

        var alreadyExists = await _userRepository.ExistsByEmailAsync(normalizedEmail, cancellationToken);
        if (alreadyExists)
        {
            return AdminService.ServiceResult<IssuedSession>.Failure(AppErrors.AdminAlreadyExists);
        }

        var hasAdmins = await _userRepository.AnyAsync(cancellationToken);
        AdminInviteToken? inviteToken = null;
        if (hasAdmins)
        {
            inviteToken = await ValidateInviteTokenAsync(request.InviteToken, cancellationToken);
            if (inviteToken is null)
            {
                return AdminService.ServiceResult<IssuedSession>.Failure(AppErrors.InviteTokenInvalid);
            }
        }

        // The first user and every invited user are admins; choosing the role of an invite is U-04 (#32).
        var user = new User { Email = normalizedEmail, Role = UserRole.Admin };
        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);
        await _userRepository.AddAsync(user);

        if (inviteToken is not null)
        {
            inviteToken.UsedAtUtc = DateTime.UtcNow;
            inviteToken.UsedByUser = user;
        }

        await _userRepository.SaveChangesAsync();

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

    public async Task<AdminService.ServiceResult<AdminInviteTokenCreateResponseDto>> GenerateInviteTokenAsync(
        int createdByUserId,
        CancellationToken cancellationToken = default)
    {
        var rawToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var inviteToken = new AdminInviteToken
        {
            TokenHash = SessionService.HashToken(rawToken),
            ExpiresAtUtc = DateTime.UtcNow.AddHours(_authOptions.InviteTokenLifetimeHours),
            CreatedByUserId = createdByUserId,
        };

        await _adminInviteTokenRepository.AddAsync(inviteToken);
        await _adminInviteTokenRepository.SaveChangesAsync();

        return AdminService.ServiceResult<AdminInviteTokenCreateResponseDto>.Success(new AdminInviteTokenCreateResponseDto
        {
            Token = rawToken,
            ExpiresAtUtc = inviteToken.ExpiresAtUtc,
        });
    }

    private async Task<AdminInviteToken?> ValidateInviteTokenAsync(string? rawToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(rawToken))
        {
            return null;
        }

        var tokenHash = SessionService.HashToken(rawToken.Trim());
        var nowUtc = DateTime.UtcNow;

        return await _adminInviteTokenRepository.GetActiveByHashAsync(tokenHash, nowUtc, cancellationToken);
    }

    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();
}
