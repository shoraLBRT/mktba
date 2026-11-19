using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Resources;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Services;

/// <summary>The device a session is issued to, recorded for the session list.</summary>
public sealed record SessionClient(string? UserAgent, string? IpAddress);

/// <summary>A new access token plus the raw refresh token the caller must put into the cookie.</summary>
public sealed record IssuedSession(AdminAuthResponseDto Auth, string RefreshToken, DateTime RefreshTokenExpiresAtUtc);

/// <summary>
/// Sessions (U-03, #31): a short-lived access token plus a rotating refresh token per device.
/// Each refresh revokes the presented token and issues a new one of the same family; presenting a
/// token that was already rotated means it was copied, so the whole family is revoked. Access
/// tokens carry the family id, and authentication accepts them only while the family is live, so
/// signing out (one device or all) also ends the access tokens already issued.
/// </summary>
public class SessionService
{
    /// <summary>Access-token claim with the device session (refresh-token family) id.</summary>
    public const string SessionIdClaimType = "mktba_sid";

    private readonly RefreshSessionRepository _sessions;
    private readonly UserRepository _users;
    private readonly AuthOptions _authOptions;
    private readonly TimeProvider _clock;
    private readonly ILogger<SessionService> _logger;

    public SessionService(
        RefreshSessionRepository sessions,
        UserRepository users,
        IOptions<AuthOptions> authOptions,
        TimeProvider clock,
        ILogger<SessionService> logger)
    {
        _sessions = sessions;
        _users = users;
        _authOptions = authOptions.Value;
        _clock = clock;
        _logger = logger;
    }

    /// <summary>Signs <paramref name="user"/> in on a new device session.</summary>
    public async Task<IssuedSession> StartAsync(User user, SessionClient client, CancellationToken cancellationToken = default)
    {
        var nowUtc = UtcNow;
        await _sessions.RemoveExpiredOfUserAsync(user.Id, nowUtc, cancellationToken);
        var (rawToken, session) = NewRefreshToken(user.Id, Guid.NewGuid(), client, nowUtc);
        await _sessions.AddAsync(session);
        await _sessions.SaveChangesAsync();
        return Issue(user, session, rawToken);
    }

    /// <summary>Exchanges a refresh token for a new access token and a new refresh token.</summary>
    public async Task<AdminService.ServiceResult<IssuedSession>> RefreshAsync(
        string? rawToken,
        SessionClient client,
        CancellationToken cancellationToken = default)
    {
        var current = await FindAsync(rawToken, cancellationToken);
        if (current is null)
        {
            return AdminService.ServiceResult<IssuedSession>.Failure(AppErrors.SessionInvalid);
        }

        var nowUtc = UtcNow;
        if (current.ReplacedById is not null)
        {
            var revoked = await RevokeAsync(await _sessions.ListUnrevokedInFamilyAsync(current.UserId, current.FamilyId, cancellationToken), nowUtc);
            _logger.LogWarning(
                "Refresh token reuse detected. UserId: {UserId}, SessionId: {SessionId}, RevokedTokens: {RevokedTokens}",
                current.UserId,
                current.FamilyId,
                revoked);
            return AdminService.ServiceResult<IssuedSession>.Failure(AppErrors.SessionInvalid);
        }

        var user = current.IsActiveAt(nowUtc) ? await _users.GetByIdAsync(current.UserId) : null;
        if (user is null)
        {
            return AdminService.ServiceResult<IssuedSession>.Failure(AppErrors.SessionInvalid);
        }

        await _sessions.RemoveExpiredOfUserAsync(user.Id, nowUtc, cancellationToken);
        var (nextRawToken, next) = NewRefreshToken(user.Id, current.FamilyId, client, nowUtc);
        await _sessions.AddAsync(next);
        current.LastUsedAtUtc = nowUtc;
        current.RevokedAtUtc = nowUtc;
        current.ReplacedBy = next;
        await _sessions.SaveChangesAsync();

        return AdminService.ServiceResult<IssuedSession>.Success(Issue(user, next, nextRawToken));
    }

    /// <summary>Ends the device session of <paramref name="rawToken"/>; an unknown or ended token is ignored.</summary>
    public async Task SignOutAsync(string? rawToken, CancellationToken cancellationToken = default)
    {
        var current = await FindAsync(rawToken, cancellationToken);
        if (current is null)
        {
            return;
        }

        await RevokeAsync(await _sessions.ListUnrevokedInFamilyAsync(current.UserId, current.FamilyId, cancellationToken), UtcNow);
    }

    /// <summary>Ends every session of the user, on every device; returns how many tokens were revoked.</summary>
    public async Task<int> SignOutEverywhereAsync(int userId, CancellationToken cancellationToken = default)
        => await RevokeAsync(await _sessions.ListUnrevokedOfUserAsync(userId, cancellationToken), UtcNow);

    /// <summary>Ends one session of the user; fails when the user has no such live session.</summary>
    public async Task<AdminService.ServiceResult<bool>> EndSessionAsync(
        int userId,
        Guid sessionId,
        CancellationToken cancellationToken = default)
    {
        var revoked = await RevokeAsync(await _sessions.ListUnrevokedInFamilyAsync(userId, sessionId, cancellationToken), UtcNow);
        return revoked == 0
            ? AdminService.ServiceResult<bool>.Failure(AppErrors.SessionNotFound)
            : AdminService.ServiceResult<bool>.Success(true);
    }

    /// <summary>The user's signed-in devices, most recently active first.</summary>
    public async Task<List<SessionDto>> ListAsync(int userId, Guid? currentSessionId, CancellationToken cancellationToken = default)
    {
        var active = await _sessions.ListActiveOfUserAsync(userId, UtcNow, cancellationToken);
        var starts = await _sessions.GetFamilyStartsAsync(userId, active.Select(session => session.FamilyId).ToList(), cancellationToken);
        return active.Select(session => new SessionDto
        {
            Id = session.FamilyId,
            StartedAtUtc = starts.GetValueOrDefault(session.FamilyId, session.CreatedAtUtc),
            LastActiveAtUtc = session.CreatedAtUtc,
            ExpiresAtUtc = session.ExpiresAtUtc,
            UserAgent = session.UserAgent,
            IpAddress = session.IpAddress,
            IsCurrent = session.FamilyId == currentSessionId,
        }).ToList();
    }

    /// <summary>Hex SHA-256 of a raw token; only the hash is stored.</summary>
    public static string HashToken(string rawToken) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken)));

    private DateTime UtcNow => _clock.GetUtcNow().UtcDateTime;

    private async Task<RefreshSession?> FindAsync(string? rawToken, CancellationToken cancellationToken)
        => string.IsNullOrWhiteSpace(rawToken)
            ? null
            : await _sessions.GetByHashAsync(HashToken(rawToken.Trim()), cancellationToken);

    private async Task<int> RevokeAsync(List<RefreshSession> tokens, DateTime nowUtc)
    {
        foreach (var token in tokens)
        {
            token.RevokedAtUtc = nowUtc;
        }

        await _sessions.SaveChangesAsync();
        return tokens.Count;
    }

    private (string RawToken, RefreshSession Session) NewRefreshToken(int userId, Guid familyId, SessionClient client, DateTime nowUtc)
    {
        var rawToken = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        return (rawToken, new RefreshSession
        {
            FamilyId = familyId,
            UserId = userId,
            TokenHash = HashToken(rawToken),
            CreatedAtUtc = nowUtc,
            ExpiresAtUtc = nowUtc.AddDays(_authOptions.RefreshTokenLifetimeDays),
            UserAgent = Truncate(client.UserAgent, MktbaDbContext.SessionUserAgentMaxLength),
            IpAddress = Truncate(client.IpAddress, MktbaDbContext.SessionIpAddressMaxLength),
        });
    }

    private IssuedSession Issue(User user, RefreshSession session, string rawRefreshToken)
    {
        if (string.IsNullOrWhiteSpace(_authOptions.JwtSigningKey))
        {
            throw new InvalidOperationException(AuthMessages.SigningKeyMissing);
        }

        var issuedAtUtc = UtcNow;
        var expiresAtUtc = issuedAtUtc.AddMinutes(_authOptions.AccessTokenLifetimeMinutes);
        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Role, user.Role.ToString()),
                new Claim(SessionIdClaimType, session.FamilyId.ToString()),
            }),
            IssuedAt = issuedAtUtc,
            NotBefore = issuedAtUtc,
            Expires = expiresAtUtc,
            Issuer = _authOptions.JwtIssuer,
            Audience = _authOptions.JwtAudience,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_authOptions.JwtSigningKey)),
                SecurityAlgorithms.HmacSha256Signature),
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var auth = new AdminAuthResponseDto
        {
            AccessToken = tokenHandler.WriteToken(tokenHandler.CreateToken(tokenDescriptor)),
            ExpiresAtUtc = expiresAtUtc,
            Email = user.Email,
            Role = user.Role,
        };
        return new IssuedSession(auth, rawRefreshToken, session.ExpiresAtUtc);
    }

    private static string? Truncate(string? value, int maxLength)
        => string.IsNullOrWhiteSpace(value) ? null : value.Length <= maxLength ? value : value[..maxLength];
}
