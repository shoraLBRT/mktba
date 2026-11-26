using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Application.Services.Accounts;
using Mktba.Application.Services.Email;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>U-05 (#126): reader sign-up, address confirmation and password reset, with the outbox walked by hand.</summary>
public sealed class ReaderAccountTests : IDisposable
{
    private static readonly DateTime Now = new(2026, 11, 26, 8, 0, 0, DateTimeKind.Utc);
    private const string Password = "a long reader passphrase";

    private readonly MktbaDbContext _db = TestDbHelper.CreateInMemoryContext();
    private readonly FeedbackTests.FakeClock _clock = new(Now);
    private readonly NotificationTests.FakeEmailSender _sender = new();
    private readonly AuthOptions _auth = new()
    {
        JwtSigningKey = "reader-account-tests-signing-key-0123456789abcdef",
        EmailConfirmationTokenLifetimeHours = 48,
        PasswordResetTokenLifetimeMinutes = 60,
        AccountEmailsPerHour = 3,
    };
    private readonly ReaderAccountService _accounts;
    private readonly AccountEmailService _emails;

    public ReaderAccountTests()
    {
        var auth = Options.Create(_auth);
        var sessions = new SessionService(
            new RefreshSessionRepository(_db), new UserRepository(_db), auth, _clock, NullLogger<SessionService>.Instance);
        _accounts = new ReaderAccountService(
            _db, sessions, new UserProfileService(new UserRepository(_db)), auth, _clock, NullLogger<ReaderAccountService>.Instance);
        _emails = new AccountEmailService(
            _db,
            _sender,
            Options.Create(new EmailOptions { SiteUrl = "https://mktba.test" }),
            auth,
            _clock,
            NullLogger<AccountEmailService>.Instance);
        _db.Users.Add(new User { Email = "admin@mktba.test", Role = UserRole.Admin, PasswordHash = "x", EmailConfirmedAtUtc = Now });
        _db.SaveChanges();
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task GivenSignUp_WhenTheEmailIsSent_ThenOnlyTheTokenHashIsStoredAndTheLinkCarriesTheRawToken()
    {
        await _accounts.SignUpAsync(new ReaderSignUpRequestDto { Email = " Reader@Mktba.Test ", Password = Password });

        var user = _db.Users.Single(candidate => candidate.Email == "reader@mktba.test");
        user.Role.Should().Be(UserRole.Reader);
        user.EmailConfirmedAtUtc.Should().BeNull();
        _db.AccountTokens.Should().BeEmpty("the token is made when the email is sent");

        await _emails.SendDueAsync();

        var token = TokenOf(_sender.Sent.Single(), "/confirm-email");
        var stored = _db.AccountTokens.Single();
        stored.TokenHash.Should().Be(SessionService.HashToken(token)).And.NotContain(token);
        stored.ExpiresAtUtc.Should().Be(Now.AddHours(48));
        _db.AccountEmails.Single().State.Should().Be(EmailDeliveryState.Sent);
    }

    [Fact]
    public async Task GivenAConfirmationLink_WhenItIsUsedTwice_ThenTheSecondUseIsRefused()
    {
        var token = await SignUpAndGetTokenAsync("reader@mktba.test");

        await _accounts.ConfirmEmailAsync(new ConfirmEmailRequestDto { Token = token });
        var again = () => _accounts.ConfirmEmailAsync(new ConfirmEmailRequestDto { Token = token });

        _db.Users.Single(user => user.Email == "reader@mktba.test").EmailConfirmedAtUtc.Should().Be(Now);
        (await again.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("account_token_invalid");
    }

    [Fact]
    public async Task GivenAConfirmationLinkPastItsLifetime_WhenUsed_ThenItIsRefusedAsExpired()
    {
        var token = await SignUpAndGetTokenAsync("reader@mktba.test");
        _clock.Advance(TimeSpan.FromHours(48));

        var confirm = () => _accounts.ConfirmEmailAsync(new ConfirmEmailRequestDto { Token = token });

        (await confirm.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("account_token_expired");
        _db.Users.Single(user => user.Email == "reader@mktba.test").EmailConfirmedAtUtc.Should().BeNull();
    }

    [Fact]
    public async Task GivenAResetLinkPastAnHour_WhenUsed_ThenItIsRefusedAndThePasswordStays()
    {
        await SignUpAndGetTokenAsync("reader@mktba.test");
        var hashBefore = _db.Users.Single(user => user.Email == "reader@mktba.test").PasswordHash;
        await _accounts.RequestPasswordResetAsync(new PasswordResetRequestDto { Email = "reader@mktba.test" });
        await _emails.SendDueAsync();
        var token = TokenOf(_sender.Sent.Last(), "/reset-password");
        _clock.Advance(TimeSpan.FromMinutes(61));

        var reset = () => _accounts.ResetPasswordAsync(new PasswordResetConfirmDto { Token = token, Password = "another long passphrase" });

        (await reset.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("account_token_expired");
        _db.Users.Single(user => user.Email == "reader@mktba.test").PasswordHash.Should().Be(hashBefore);
    }

    [Fact]
    public async Task GivenAConfirmationToken_WhenUsedForAReset_ThenItIsRefused()
    {
        var token = await SignUpAndGetTokenAsync("reader@mktba.test");

        var reset = () => _accounts.ResetPasswordAsync(new PasswordResetConfirmDto { Token = token, Password = "another long passphrase" });

        (await reset.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("account_token_invalid");
    }

    [Fact]
    public async Task GivenMoreRequestsThanTheHourlyCap_WhenTheyArrive_ThenOnlyTheCapIsQueuedAndTheNextHourFreesIt()
    {
        await SignUpAndGetTokenAsync("reader@mktba.test");

        for (var i = 0; i < 5; i++)
        {
            await _accounts.RequestPasswordResetAsync(new PasswordResetRequestDto { Email = "reader@mktba.test" });
        }

        _db.AccountEmails.Count(email => email.Purpose == AccountEmailPurpose.PasswordReset).Should().Be(3);

        _clock.Advance(TimeSpan.FromMinutes(61));
        await _accounts.RequestPasswordResetAsync(new PasswordResetRequestDto { Email = "reader@mktba.test" });
        _db.AccountEmails.Count(email => email.Purpose == AccountEmailPurpose.PasswordReset).Should().Be(4);
    }

    [Fact]
    public async Task GivenTheMailServerIsAway_WhenTheOutboxIsWalked_ThenTheEmailWaitsAndTheNextAttemptGetsAFreshToken()
    {
        await _accounts.SignUpAsync(new ReaderSignUpRequestDto { Email = "reader@mktba.test", Password = Password });
        _sender.Failure = new EmailSendException("421 try later", permanent: false);

        var run = await _emails.SendDueAsync();

        run.ServerUnavailable.Should().BeTrue();
        var email = _db.AccountEmails.Single();
        email.State.Should().Be(EmailDeliveryState.Pending);
        email.Attempts.Should().Be(1);

        _sender.Failure = null;
        _clock.Advance(TimeSpan.FromMinutes(2));
        await _emails.SendDueAsync();

        _sender.Sent.Should().ContainSingle();
        _db.AccountEmails.Single().State.Should().Be(EmailDeliveryState.Sent);
        var token = TokenOf(_sender.Sent.Single(), "/confirm-email");
        await _accounts.ConfirmEmailAsync(new ConfirmEmailRequestDto { Token = token });
    }

    [Fact]
    public async Task GivenSignUpWithAKnownAddress_WhenTheEmailIsSent_ThenTheOwnerGetsANoteWithoutAToken()
    {
        await _accounts.SignUpAsync(new ReaderSignUpRequestDto { Email = "admin@mktba.test", Password = Password });
        await _emails.SendDueAsync();

        _db.Users.Count().Should().Be(1);
        _db.Users.Single().PasswordHash.Should().Be("x");
        var note = _sender.Sent.Single();
        note.To.Should().Be("admin@mktba.test");
        note.Subject.Should().Contain("Попытка регистрации");
        note.TextBody.Should().NotContain("#token=");
        _db.AccountTokens.Should().BeEmpty();
    }

    [Fact]
    public async Task GivenSignUpWithADisplayName_WhenStored_ThenTheProfileGetsTheNameAndASlug()
    {
        await _accounts.SignUpAsync(new ReaderSignUpRequestDto { Email = "reader@mktba.test", Password = Password, DisplayName = "  Абдулла  " });

        var user = _db.Users.Single(candidate => candidate.Email == "reader@mktba.test");
        user.DisplayName.Should().Be("Абдулла");
        user.Slug.Should().Be("abdulla");
    }

    [Fact]
    public async Task GivenSignUpSwitchedOff_WhenSomeoneSignsUp_ThenItIsRefused()
    {
        _auth.ReaderSignUpEnabled = false;

        var signUp = () => _accounts.SignUpAsync(new ReaderSignUpRequestDto { Email = "reader@mktba.test", Password = Password });

        (await signUp.Should().ThrowAsync<ForbiddenException>()).Which.Error.Code.Should().Be("reader_sign_up_closed");
    }

    private async Task<string> SignUpAndGetTokenAsync(string email)
    {
        await _accounts.SignUpAsync(new ReaderSignUpRequestDto { Email = email, Password = Password });
        await _emails.SendDueAsync();
        return TokenOf(_sender.Sent.Last(), "/confirm-email");
    }

    /// <summary>The raw token of the link to <paramref name="path"/> in the email.</summary>
    private static string TokenOf(EmailMessage message, string path)
    {
        var marker = $"https://mktba.test{path}#token=";
        var start = message.TextBody.IndexOf(marker, StringComparison.Ordinal);
        start.Should().BeGreaterThanOrEqualTo(0, $"the email links to {path}");
        var token = message.TextBody[(start + marker.Length)..].Split('\n')[0];
        token.Should().NotBeEmpty();
        return token;
    }
}
