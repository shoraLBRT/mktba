using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>U-04 (#32): invites carry a role and an expiry, are single-use, and the last admin stays an admin.</summary>
public sealed class InviteRegistrationTests
{
    private static readonly SessionClient Browser = new("Mozilla/5.0 test", "203.0.113.7");
    private static readonly IOptions<AuthOptions> Options = Microsoft.Extensions.Options.Options.Create(new AuthOptions
    {
        JwtSigningKey = "invite-registration-tests-signing-key-0123456789",
        InviteTokenLifetimeHours = 24,
    });

    private readonly string _databaseName = Guid.NewGuid().ToString();
    private readonly int _adminId;

    public InviteRegistrationTests()
    {
        using var context = NewContext();
        var admin = new User { Email = "admin@mktba.test", Role = UserRole.Admin, PasswordHash = "x" };
        context.Users.Add(admin);
        context.SaveChanges();
        _adminId = admin.Id;
    }

    [Fact]
    public async Task GivenAnInviteWithoutLifetime_WhenCreated_ThenItUsesTheConfiguredLifetimeAndStoresOnlyTheHash()
    {
        using var context = NewContext();

        var created = await InvitesIn(context).CreateAsync(_adminId, new InviteCreateRequestDto { Role = UserRole.Author, Note = "  " });

        var stored = await context.Invites.SingleAsync();
        stored.Role.Should().Be(UserRole.Author);
        stored.Note.Should().BeNull();
        stored.ExpiresAtUtc.Should().Be(stored.CreatedAtUtc.AddHours(24));
        stored.TokenHash.Should().Be(SessionService.HashToken(created.Token)).And.NotBe(created.Token);
        created.Token.Should().HaveLength(64, "32 random bytes in hex");
    }

    [Fact]
    public async Task GivenANoteOverTheLimit_WhenCreatingAnInvite_ThenItIsRefused()
    {
        using var context = NewContext();

        var act = () => InvitesIn(context).CreateAsync(_adminId, new InviteCreateRequestDto { Role = UserRole.Reader, Note = new string('n', 201) });

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("invite_note_too_long");
    }

    [Fact]
    public async Task GivenTwoRegistrationsRacingForOneInvite_WhenBothSave_ThenOnlyTheFirstSucceeds()
    {
        string token;
        using (var context = NewContext())
        {
            token = (await InvitesIn(context).CreateAsync(_adminId, new InviteCreateRequestDto { Role = UserRole.Author })).Token;
        }

        using var first = NewContext();
        using var second = NewContext();
        // Both requests read the invite as unused before either saves.
        await first.Invites.SingleAsync();
        await second.Invites.SingleAsync();

        var firstResult = await AuthIn(first).RegisterAsync(Request("one@mktba.test", token), Browser);
        var secondResult = await AuthIn(second).RegisterAsync(Request("two@mktba.test", token), Browser);

        firstResult.IsSuccess.Should().BeTrue();
        secondResult.IsSuccess.Should().BeFalse();
        secondResult.Error!.Code.Should().Be("invite_used");
        using var check = NewContext();
        (await check.Invites.SingleAsync()).UsedByUserId.Should().Be((await check.Users.SingleAsync(u => u.Email == "one@mktba.test")).Id);
    }

    [Fact]
    public async Task GivenAnInviteRevokedAfterItWasRead_WhenRegistering_ThenTheRegistrationIsRefused()
    {
        string token;
        int inviteId;
        using (var context = NewContext())
        {
            var created = await InvitesIn(context).CreateAsync(_adminId, new InviteCreateRequestDto { Role = UserRole.Scholar });
            (token, inviteId) = (created.Token, created.Id);
        }

        using var registering = NewContext();
        await registering.Invites.SingleAsync();
        using (var revoking = NewContext())
        {
            await InvitesIn(revoking).RevokeAsync(inviteId);
        }

        var result = await AuthIn(registering).RegisterAsync(Request("late@mktba.test", token), Browser);

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("invite_used", "the guarded update finds the invite no longer open");
    }

    [Fact]
    public async Task GivenTheOnlyAdmin_WhenGivenAnotherRole_ThenItIsRefusedAndAnotherAdminCanBeDemoted()
    {
        using var context = NewContext();
        var users = new UserAdminService(new UserRepository(context));

        var act = () => users.ChangeRoleAsync(_adminId, UserRole.Reader);
        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("last_admin_demotion");

        var second = new User { Email = "second@mktba.test", Role = UserRole.Admin, PasswordHash = "x" };
        context.Users.Add(second);
        await context.SaveChangesAsync();
        (await users.ChangeRoleAsync(_adminId, UserRole.Author)).Role.Should().Be(UserRole.Author);
    }

    private MktbaDbContext NewContext() => new(new DbContextOptionsBuilder<MktbaDbContext>().UseInMemoryDatabase(_databaseName).Options);

    private static InviteService InvitesIn(MktbaDbContext context) => new(new InviteRepository(context), TimeProvider.System, Options);

    private static AdminAuthService AuthIn(MktbaDbContext context) => new(
        new UserRepository(context),
        new InviteRepository(context),
        new SessionService(new RefreshSessionRepository(context), new UserRepository(context), Options, TimeProvider.System, NullLogger<SessionService>.Instance),
        TimeProvider.System);

    private static AdminRegisterRequestDto Request(string email, string token)
        => new() { Email = email, Password = "Test-password-1", InviteToken = token };
}
