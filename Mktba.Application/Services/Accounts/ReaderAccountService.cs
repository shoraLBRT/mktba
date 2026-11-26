using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Microsoft.IdentityModel.Tokens;

namespace Mktba.Application.Services.Accounts;

/// <summary>
/// Readers' own accounts (U-05, #126): open sign-up, address confirmation and password reset.
/// </summary>
/// <remarks>
/// Nothing here tells whether an address has an account: sign-up and the reset request answer the
/// same for a known and an unknown address, and the emails they cause go through the outbox
/// (<see cref="AccountEmailService"/>), so the answer does not wait for the mail server either. Each
/// purpose is capped at <see cref="AuthOptions.AccountEmailsPerHour"/> emails per account; past it a
/// request is answered as usual and queues nothing. A token is the SHA-256 hash of a random value;
/// it is looked up by its hash and compared again in constant time.
/// </remarks>
public sealed class ReaderAccountService
{
    private readonly MktbaDbContext _db;
    private readonly SessionService _sessions;
    private readonly UserProfileService _profiles;
    private readonly AuthOptions _options;
    private readonly TimeProvider _clock;
    private readonly ILogger<ReaderAccountService> _logger;
    private readonly PasswordHasher<User> _passwordHasher = new();

    public ReaderAccountService(
        MktbaDbContext db,
        SessionService sessions,
        UserProfileService profiles,
        IOptions<AuthOptions> options,
        TimeProvider clock,
        ILogger<ReaderAccountService> logger)
    {
        _db = db;
        _sessions = sessions;
        _profiles = profiles;
        _options = options.Value;
        _clock = clock;
        _logger = logger;
    }

    /// <summary>Whether sign-up is open now: switched on, and the first admin already exists.</summary>
    public async Task<bool> IsSignUpOpenAsync(CancellationToken cancellationToken = default)
        => _options.ReaderSignUpEnabled && await _db.Users.AnyAsync(cancellationToken);

    /// <summary>
    /// Opens a reader account and queues its confirmation email; for an address that already has an
    /// account, queues a note to its owner instead. Either way the caller learns nothing more than
    /// that the request was taken. The reader is not signed in: they sign in with the password.
    /// </summary>
    /// <exception cref="ForbiddenException">Sign-up is switched off, or the first admin does not exist yet.</exception>
    /// <exception cref="ValidationException">The email, password or display name is not acceptable.</exception>
    public async Task SignUpAsync(ReaderSignUpRequestDto request, CancellationToken cancellationToken = default)
    {
        if (!await IsSignUpOpenAsync(cancellationToken))
        {
            throw new ForbiddenException(AppErrors.ReaderSignUpClosed);
        }

        // Before any validation: a bot must not learn from a 400 that the trap is what gave it away.
        if (!string.IsNullOrWhiteSpace(request.Website))
        {
            _logger.LogInformation("Sign-up dropped: the trap field was filled in.");
            return;
        }

        var email = RequireEmail(request.Email);
        if (string.IsNullOrEmpty(request.Password))
        {
            throw new ValidationException(AppErrors.EmailAndPasswordRequired);
        }

        if (PasswordRules.Check(request.Password, email) is { } passwordError)
        {
            throw new ValidationException(passwordError);
        }

        var profile = UserProfileRules.Normalize(new UserProfileWriteDto(request.DisplayName, null, null, null, null, null, []));
        if (UserProfileRules.Check(profile) is { } profileError)
        {
            throw new ValidationException(profileError);
        }

        // Hashed before the lookup, so a known address takes as long as a new one.
        var user = new User { Email = email, Role = UserRole.Reader };
        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);

        var existing = await _db.Users.FirstOrDefaultAsync(candidate => candidate.Email == email, cancellationToken);
        if (existing is not null)
        {
            await QueueAsync(existing.Id, AccountEmailPurpose.SignUpAttempt, cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
            return;
        }

        var now = UtcNow;
        user.CreatedAtUtc = now;
        _db.Users.Add(user);
        _db.AccountEmails.Add(NewEmail(user, AccountEmailPurpose.EmailConfirmation, now));
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Another sign-up with the same address won the unique index: answer as for a known address.
            _db.ChangeTracker.Clear();
            return;
        }

        if (profile.DisplayName is not null)
        {
            await _profiles.UpdateAsync(user.Id, profile, cancellationToken);
        }
    }

    /// <summary>Confirms the address of the token's account; a confirmed one stays as it is.</summary>
    /// <exception cref="ValidationException">The token is unknown, used (account_token_invalid) or expired (account_token_expired).</exception>
    public async Task ConfirmEmailAsync(ConfirmEmailRequestDto request, CancellationToken cancellationToken = default)
    {
        var token = await UseTokenAsync(request.Token, AccountEmailPurpose.EmailConfirmation, cancellationToken);
        token.User.EmailConfirmedAtUtc ??= UtcNow;
        await SaveUseAsync(cancellationToken);
    }

    /// <summary>Queues another confirmation email to the signed-in user; nothing when the address is confirmed.</summary>
    /// <exception cref="TooManyRequestsException">The hourly cap of the account is reached (account_email_limit_reached).</exception>
    public async Task ResendConfirmationAsync(int userId, CancellationToken cancellationToken = default)
    {
        var user = await _db.Users.FirstOrDefaultAsync(candidate => candidate.Id == userId, cancellationToken)
            ?? throw new NotFoundException(AppErrors.UserNotFound(userId));
        if (user.EmailConfirmedAtUtc is not null)
        {
            return;
        }

        if (!await QueueAsync(user.Id, AccountEmailPurpose.EmailConfirmation, cancellationToken))
        {
            throw new TooManyRequestsException(AppErrors.AccountEmailLimitReached);
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Queues a reset email when the address has an account; the same answer when it has none.</summary>
    /// <exception cref="ValidationException">The address is missing or not an email address.</exception>
    public async Task RequestPasswordResetAsync(PasswordResetRequestDto request, CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(request.Website))
        {
            _logger.LogInformation("Password reset request dropped: the trap field was filled in.");
            return;
        }

        var email = RequireEmail(request.Email);
        var userId = await _db.Users.Where(user => user.Email == email).Select(user => (int?)user.Id).FirstOrDefaultAsync(cancellationToken);
        if (userId is int id && await QueueAsync(id, AccountEmailPurpose.PasswordReset, cancellationToken))
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
    }

    /// <summary>
    /// Sets the new password of the token's account, confirms its address (the link proved it), and
    /// ends every session of the account: whoever knew the old password is signed out.
    /// </summary>
    /// <exception cref="ValidationException">The token is not usable, or the password breaks a rule.</exception>
    public async Task ResetPasswordAsync(PasswordResetConfirmDto request, CancellationToken cancellationToken = default)
    {
        var token = await UseTokenAsync(request.Token, AccountEmailPurpose.PasswordReset, cancellationToken);
        var user = token.User;
        if (string.IsNullOrEmpty(request.Password))
        {
            throw new ValidationException(AppErrors.EmailAndPasswordRequired);
        }

        if (PasswordRules.Check(request.Password, user.Email) is { } passwordError)
        {
            throw new ValidationException(passwordError);
        }

        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);
        user.EmailConfirmedAtUtc ??= UtcNow;
        await SaveUseAsync(cancellationToken);
        await _sessions.SignOutEverywhereAsync(user.Id, cancellationToken);
        _logger.LogInformation("Password of user {UserId} was reset; every session ended.", user.Id);
    }

    /// <summary>A new random token (its raw form for the link) of <paramref name="purpose"/> for <paramref name="userId"/>.</summary>
    internal static (string RawToken, AccountToken Token) NewToken(int userId, AccountEmailPurpose purpose, DateTime now, TimeSpan lifetime)
    {
        var raw = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        return (raw, new AccountToken
        {
            UserId = userId,
            Purpose = purpose,
            TokenHash = SessionService.HashToken(raw),
            CreatedAtUtc = now,
            ExpiresAtUtc = now + lifetime,
        });
    }

    /// <summary>
    /// The live token of <paramref name="purpose"/> matching <paramref name="rawToken"/>, with its
    /// user; every token of that user and purpose is marked for deletion (single use).
    /// </summary>
    private async Task<AccountToken> UseTokenAsync(string? rawToken, AccountEmailPurpose purpose, CancellationToken cancellationToken)
    {
        var trimmed = rawToken?.Trim();
        if (string.IsNullOrEmpty(trimmed) || trimmed.Length > 128)
        {
            throw new ValidationException(AppErrors.AccountTokenInvalid);
        }

        var hash = SessionService.HashToken(trimmed);
        var token = await _db.AccountTokens.Include(candidate => candidate.User)
            .FirstOrDefaultAsync(candidate => candidate.TokenHash == hash && candidate.Purpose == purpose, cancellationToken);
        if (token is null
            || !CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(token.TokenHash), Encoding.ASCII.GetBytes(hash)))
        {
            throw new ValidationException(AppErrors.AccountTokenInvalid);
        }

        if (token.ExpiresAtUtc <= UtcNow)
        {
            throw new ValidationException(AppErrors.AccountTokenExpired);
        }

        _db.AccountTokens.RemoveRange(await _db.AccountTokens
            .Where(candidate => candidate.UserId == token.UserId && candidate.Purpose == purpose)
            .ToListAsync(cancellationToken));
        return token;
    }

    /// <summary>Saves a token's use; of two uses racing for one token only the first deletes it.</summary>
    private async Task SaveUseAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ValidationException(AppErrors.AccountTokenInvalid);
        }
    }

    /// <summary>Adds an email of <paramref name="purpose"/> to the outbox unless the account's hourly cap is reached; false then.</summary>
    private async Task<bool> QueueAsync(int userId, AccountEmailPurpose purpose, CancellationToken cancellationToken)
    {
        var now = UtcNow;
        var since = now.AddHours(-1);
        var recent = await _db.AccountEmails.CountAsync(
            email => email.UserId == userId && email.Purpose == purpose && email.CreatedAtUtc > since, cancellationToken);
        if (recent >= Math.Max(1, _options.AccountEmailsPerHour))
        {
            _logger.LogInformation("Account email {Purpose} for user {UserId} not queued: the hourly cap is reached.", purpose, userId);
            return false;
        }

        _db.AccountEmails.Add(new AccountEmail { UserId = userId, Purpose = purpose, CreatedAtUtc = now, NextAttemptAt = now });
        return true;
    }

    private static AccountEmail NewEmail(User user, AccountEmailPurpose purpose, DateTime now)
        => new() { User = user, Purpose = purpose, CreatedAtUtc = now, NextAttemptAt = now };

    /// <summary>The address trimmed and lower-cased, as accounts store it.</summary>
    /// <exception cref="ValidationException">It is missing or not a plain email address.</exception>
    private static string RequireEmail(string? value)
    {
        var email = value?.Trim().ToLowerInvariant() ?? string.Empty;
        if (email.Length == 0)
        {
            throw new ValidationException(AppErrors.EmailAndPasswordRequired);
        }

        if (email.Length > EmailMaxLength
            || !MailAddress.TryCreate(email, out var address)
            || address.Address != email
            || address.DisplayName.Length > 0)
        {
            throw new ValidationException(AppErrors.EmailInvalid);
        }

        return email;
    }

    private DateTime UtcNow => _clock.GetUtcNow().UtcDateTime;

    /// <summary>The longest address an account takes (the column of <see cref="User.Email"/>).</summary>
    private const int EmailMaxLength = 320;
}
