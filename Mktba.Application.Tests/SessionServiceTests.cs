using System.IdentityModel.Tokens.Jwt;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>U-03 (#31): refresh-token rotation, reuse detection, expiry and sign-out.</summary>
public sealed class SessionServiceTests : IDisposable
{
    private static readonly SessionClient Browser = new("Mozilla/5.0 test", "203.0.113.7");

    private readonly MktbaDbContext _context = TestDbHelper.CreateInMemoryContext();
    private readonly FakeClock _clock = new(new DateTime(2026, 11, 19, 8, 0, 0, DateTimeKind.Utc));
    private readonly SessionService _service;
    private readonly User _user;

    public SessionServiceTests()
    {
        var options = Options.Create(new AuthOptions
        {
            JwtSigningKey = "session-service-tests-signing-key-0123456789abcdef",
            AccessTokenLifetimeMinutes = 15,
            RefreshTokenLifetimeDays = 30,
        });
        _service = new SessionService(
            new RefreshSessionRepository(_context),
            new UserRepository(_context),
            options,
            _clock,
            NullLogger<SessionService>.Instance);
        _user = new User { Email = "admin@mktba.test", Role = UserRole.Admin, PasswordHash = "x" };
        _context.Users.Add(_user);
        _context.SaveChanges();
    }

    public void Dispose() => _context.Dispose();

    [Fact]
    public async Task GivenASignIn_WhenTheSessionStarts_ThenOnlyTheTokenHashIsStoredAndTheAccessTokenNamesTheSession()
    {
        var issued = await _service.StartAsync(_user, Browser);

        var stored = _context.RefreshSessions.Single();
        stored.TokenHash.Should().Be(SessionService.HashToken(issued.RefreshToken)).And.NotBe(issued.RefreshToken);
        issued.RefreshToken.Length.Should().BeGreaterThanOrEqualTo(43, "32 random bytes in base64url");
        stored.ExpiresAtUtc.Should().Be(_clock.Now.AddDays(30));
        stored.UserAgent.Should().Be("Mozilla/5.0 test");
        var claims = new JwtSecurityTokenHandler().ReadJwtToken(issued.Auth.AccessToken).Claims;
        claims.Should().Contain(c => c.Type == SessionService.SessionIdClaimType && c.Value == stored.FamilyId.ToString());
    }

    [Fact]
    public async Task GivenAValidRefreshToken_WhenRefreshing_ThenTheTokenIsRotatedWithinTheSameSession()
    {
        var first = await _service.StartAsync(_user, Browser);
        _clock.Advance(TimeSpan.FromDays(10));

        var result = await _service.RefreshAsync(first.RefreshToken, Browser);

        result.IsSuccess.Should().BeTrue();
        result.Value!.RefreshToken.Should().NotBe(first.RefreshToken);
        var rows = _context.RefreshSessions.OrderBy(s => s.Id).ToList();
        rows.Should().HaveCount(2);
        rows[0].RevokedAtUtc.Should().Be(_clock.Now);
        rows[0].ReplacedById.Should().Be(rows[1].Id);
        rows[1].FamilyId.Should().Be(rows[0].FamilyId);
        rows[1].ExpiresAtUtc.Should().Be(_clock.Now.AddDays(30), "the lifetime slides with every refresh");
    }

    [Fact]
    public async Task GivenARotatedToken_WhenItIsPresentedAgain_ThenTheWholeSessionIsRevoked()
    {
        var first = await _service.StartAsync(_user, Browser);
        var second = await _service.RefreshAsync(first.RefreshToken, Browser);

        var reuse = await _service.RefreshAsync(first.RefreshToken, Browser);

        reuse.IsSuccess.Should().BeFalse();
        reuse.Error!.Code.Should().Be(AppErrors.SessionInvalid.Code);
        _context.RefreshSessions.Should().OnlyContain(s => s.RevokedAtUtc != null);
        (await _service.RefreshAsync(second.Value!.RefreshToken, Browser)).IsSuccess.Should().BeFalse(
            "the thief's or the owner's newer token dies with the family");
    }

    [Fact]
    public async Task GivenAReusedTokenOfOneDevice_WhenTheSessionIsRevoked_ThenOtherDevicesStaySignedIn()
    {
        var laptop = await _service.StartAsync(_user, Browser);
        var phone = await _service.StartAsync(_user, Browser);
        await _service.RefreshAsync(laptop.RefreshToken, Browser);

        await _service.RefreshAsync(laptop.RefreshToken, Browser);

        (await _service.RefreshAsync(phone.RefreshToken, Browser)).IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task GivenAnExpiredRefreshToken_WhenRefreshing_ThenFails()
    {
        var issued = await _service.StartAsync(_user, Browser);
        _clock.Advance(TimeSpan.FromDays(30) + TimeSpan.FromSeconds(1));

        var result = await _service.RefreshAsync(issued.RefreshToken, Browser);

        result.Error!.Code.Should().Be(AppErrors.SessionInvalid.Code);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-a-token-we-issued")]
    public async Task GivenAMissingOrUnknownToken_WhenRefreshing_ThenFails(string? rawToken)
    {
        var result = await _service.RefreshAsync(rawToken, Browser);

        result.Error!.Code.Should().Be(AppErrors.SessionInvalid.Code);
    }

    [Fact]
    public async Task GivenASignedInDevice_WhenSigningOut_ThenItsTokenNoLongerRefreshes()
    {
        var issued = await _service.StartAsync(_user, Browser);

        await _service.SignOutAsync(issued.RefreshToken);

        (await _service.RefreshAsync(issued.RefreshToken, Browser)).IsSuccess.Should().BeFalse();
    }

    [Fact]
    public async Task GivenTwoDevices_WhenSigningOutEverywhere_ThenNeitherRefreshes()
    {
        var laptop = await _service.StartAsync(_user, Browser);
        var phone = await _service.StartAsync(_user, Browser);

        var revoked = await _service.SignOutEverywhereAsync(_user.Id);

        revoked.Should().Be(2);
        (await _service.RefreshAsync(laptop.RefreshToken, Browser)).IsSuccess.Should().BeFalse();
        (await _service.RefreshAsync(phone.RefreshToken, Browser)).IsSuccess.Should().BeFalse();
    }

    [Fact]
    public async Task GivenTwoDevices_WhenListing_ThenEachAppearsOnceWithItsStartAndTheCurrentOneMarked()
    {
        var laptop = await _service.StartAsync(_user, Browser);
        _clock.Advance(TimeSpan.FromHours(1));
        await _service.StartAsync(_user, Browser);
        _clock.Advance(TimeSpan.FromHours(1));
        await _service.RefreshAsync(laptop.RefreshToken, Browser);
        var laptopId = _context.RefreshSessions.OrderBy(s => s.Id).First().FamilyId;

        var sessions = await _service.ListAsync(_user.Id, laptopId);

        sessions.Should().HaveCount(2);
        var current = sessions.Single(s => s.IsCurrent);
        current.Id.Should().Be(laptopId);
        current.StartedAtUtc.Should().Be(_clock.Now.AddHours(-2));
        current.LastActiveAtUtc.Should().Be(_clock.Now);
        sessions[0].Should().BeSameAs(current, "the most recently active session comes first");
    }

    [Fact]
    public async Task GivenAnotherUsersSession_WhenEndingIt_ThenNotFoundAndItStaysLive()
    {
        var issued = await _service.StartAsync(_user, Browser);
        var familyId = _context.RefreshSessions.Single().FamilyId;

        var result = await _service.EndSessionAsync(_user.Id + 1, familyId);

        result.Error!.Code.Should().Be(AppErrors.SessionNotFound.Code);
        (await _service.RefreshAsync(issued.RefreshToken, Browser)).IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task GivenExpiredTokens_WhenTheUserSignsInAgain_ThenTheExpiredRowsAreRemoved()
    {
        await _service.StartAsync(_user, Browser);
        _clock.Advance(TimeSpan.FromDays(31));

        await _service.StartAsync(_user, Browser);

        _context.RefreshSessions.Should().ContainSingle();
    }

    [Fact]
    public async Task GivenAVeryLongUserAgent_WhenTheSessionStarts_ThenItIsCutToTheColumnLength()
    {
        await _service.StartAsync(_user, new SessionClient(new string('a', 1000), null));

        _context.RefreshSessions.Single().UserAgent!.Length.Should().Be(MktbaDbContext.SessionUserAgentMaxLength);
    }

    private sealed class FakeClock(DateTime start) : TimeProvider
    {
        private DateTimeOffset _now = new(start);

        public DateTime Now => _now.UtcDateTime;

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan by) => _now = _now.Add(by);
    }
}
