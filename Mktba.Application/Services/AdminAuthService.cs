using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Resources;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services;

public class AdminAuthService
{
    private readonly UserRepository _userRepository;
    private readonly AdminInviteTokenRepository _adminInviteTokenRepository;
    private readonly AuthOptions _authOptions;
    private readonly PasswordHasher<User> _passwordHasher = new();

    public AdminAuthService(
        UserRepository userRepository,
        AdminInviteTokenRepository adminInviteTokenRepository,
        IOptions<AuthOptions> authOptions)
    {
        _userRepository = userRepository;
        _adminInviteTokenRepository = adminInviteTokenRepository;
        _authOptions = authOptions.Value;
    }

    public async Task<AdminAuthStatusDto> GetAuthStatusAsync(CancellationToken cancellationToken = default)
    {
        var hasAdmins = await _userRepository.AnyAsync(cancellationToken);
        return new AdminAuthStatusDto { RequiresBootstrapAdmin = !hasAdmins };
    }

    public async Task<AdminService.ServiceResult<AdminAuthResponseDto>> RegisterAsync(
        AdminRegisterRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var normalizedEmail = NormalizeEmail(request.Email);
        if (string.IsNullOrWhiteSpace(normalizedEmail) || string.IsNullOrWhiteSpace(request.Password))
        {
            return AdminService.ServiceResult<AdminAuthResponseDto>.Failure(AuthMessages.EmailAndPasswordRequired);
        }

        var alreadyExists = await _userRepository.ExistsByEmailAsync(normalizedEmail, cancellationToken);
        if (alreadyExists)
        {
            return AdminService.ServiceResult<AdminAuthResponseDto>.Failure(AuthMessages.AdminAlreadyExists);
        }

        var hasAdmins = await _userRepository.AnyAsync(cancellationToken);
        AdminInviteToken? inviteToken = null;
        if (hasAdmins)
        {
            inviteToken = await ValidateInviteTokenAsync(request.InviteToken, cancellationToken);
            if (inviteToken is null)
            {
                return AdminService.ServiceResult<AdminAuthResponseDto>.Failure(AuthMessages.InviteTokenInvalid);
            }
        }

        var user = new User { Email = normalizedEmail };
        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);
        await _userRepository.AddAsync(user);

        if (inviteToken is not null)
        {
            inviteToken.UsedAtUtc = DateTime.UtcNow;
            inviteToken.UsedByUser = user;
        }

        await _userRepository.SaveChangesAsync();

        return AdminService.ServiceResult<AdminAuthResponseDto>.Success(CreateAuthResponse(user));
    }

    public async Task<AdminService.ServiceResult<AdminAuthResponseDto>> LoginAsync(
        AdminLoginRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var normalizedEmail = NormalizeEmail(request.Email);
        if (string.IsNullOrWhiteSpace(normalizedEmail) || string.IsNullOrWhiteSpace(request.Password))
        {
            return AdminService.ServiceResult<AdminAuthResponseDto>.Failure(AuthMessages.EmailAndPasswordRequired);
        }

        var user = await _userRepository.GetByEmailAsync(normalizedEmail, cancellationToken);
        if (user is null)
        {
            return AdminService.ServiceResult<AdminAuthResponseDto>.Failure(AuthMessages.InvalidCredentials);
        }

        var verificationResult = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verificationResult == PasswordVerificationResult.Failed)
        {
            return AdminService.ServiceResult<AdminAuthResponseDto>.Failure(AuthMessages.InvalidCredentials);
        }

        return AdminService.ServiceResult<AdminAuthResponseDto>.Success(CreateAuthResponse(user));
    }

    public async Task<AdminService.ServiceResult<AdminInviteTokenCreateResponseDto>> GenerateInviteTokenAsync(
        int createdByUserId,
        CancellationToken cancellationToken = default)
    {
        var rawToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var inviteToken = new AdminInviteToken
        {
            TokenHash = HashToken(rawToken),
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

        var tokenHash = HashToken(rawToken.Trim());
        var nowUtc = DateTime.UtcNow;

        return await _adminInviteTokenRepository.GetActiveByHashAsync(tokenHash, nowUtc, cancellationToken);
    }

    private AdminAuthResponseDto CreateAuthResponse(User user)
    {
        if (string.IsNullOrWhiteSpace(_authOptions.JwtSigningKey))
        {
            throw new InvalidOperationException(AuthMessages.SigningKeyMissing);
        }

        var expiresAtUtc = DateTime.UtcNow.AddMinutes(_authOptions.AccessTokenLifetimeMinutes);
        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Role, user.Role.ToString()),
            }),
            Expires = expiresAtUtc,
            Issuer = _authOptions.JwtIssuer,
            Audience = _authOptions.JwtAudience,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_authOptions.JwtSigningKey)),
                SecurityAlgorithms.HmacSha256Signature),
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var token = tokenHandler.CreateToken(tokenDescriptor);
        return new AdminAuthResponseDto
        {
            AccessToken = tokenHandler.WriteToken(token),
            ExpiresAtUtc = expiresAtUtc,
            Email = user.Email,
        };
    }

    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    private static string HashToken(string rawToken)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawToken));
        return Convert.ToHexString(bytes);
    }
}
