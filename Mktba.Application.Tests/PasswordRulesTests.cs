using FluentAssertions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>U-06 (#134): what a new password must be, and that the rules do not touch signing in.</summary>
public sealed class PasswordRulesTests
{
    private static readonly SessionClient Browser = new("Mozilla/5.0 test", "203.0.113.7");
    private static readonly IOptions<AuthOptions> Options = Microsoft.Extensions.Options.Options.Create(new AuthOptions
    {
        JwtSigningKey = "password-rules-tests-signing-key-0123456789abcdef",
        InviteTokenLifetimeHours = 24,
    });

    private readonly string _databaseName = Guid.NewGuid().ToString();

    [Theory]
    [InlineData("correct horse")]
    [InlineData("Test-password-1")]
    [InlineData("пароль-из-слов")]
    [InlineData("            x")]
    public void GivenALongEnoughPassword_WhenChecked_ThenItIsAccepted(string password)
        => PasswordRules.Check(password, "admin@mktba.test").Should().BeNull();

    [Fact]
    public void GivenAPasswordOfMinLengthAndMaxLength_WhenChecked_ThenBothBoundsAreAccepted()
    {
        PasswordRules.Check(new string('a', PasswordRules.MinLength - 1) + "b", null).Should().BeNull();
        PasswordRules.Check(new string('a', PasswordRules.MaxLength - 1) + "b", null).Should().BeNull();
    }

    [Fact]
    public void GivenAShortPassword_WhenChecked_ThenItIsTooShortWithTheMinimum()
    {
        var error = PasswordRules.Check("Short-pass1", null);

        error!.Code.Should().Be("password_too_short");
        error.Params.Should().ContainKey("minLength").WhoseValue.Should().Be(PasswordRules.MinLength);
    }

    [Fact]
    public void GivenALongPassword_WhenChecked_ThenItIsTooLong()
        => PasswordRules.Check(new string('a', PasswordRules.MaxLength) + "b", null)!.Code.Should().Be("password_too_long");

    [Fact]
    public void GivenCharactersOutsideTheBasicPlane_WhenChecked_ThenEachCountsAsOne()
    {
        // 11 emoji are 22 UTF-16 units but 11 characters: still too short.
        var eleven = string.Concat(Enumerable.Repeat("😀", 5)) + string.Concat(Enumerable.Repeat("🌙", 6));
        PasswordRules.Check(eleven, null)!.Code.Should().Be("password_too_short");
        PasswordRules.Check(eleven + "🌙", null).Should().BeNull();
    }

    [Theory]
    [InlineData("aaaaaaaaaaaaaa", "admin@mktba.test")]
    [InlineData("Long.Name@Mktba.test", "long.name@mktba.test")]
    [InlineData("LONG.NAME.HERE", "long.name.here@mktba.test")]
    public void GivenTheEmailOrOneRepeatedCharacter_WhenChecked_ThenItIsTooSimple(string password, string email)
        => PasswordRules.Check(password, email)!.Code.Should().Be("password_too_simple");

    [Fact]
    public async Task GivenAShortPassword_WhenRegistering_ThenNoUserIsCreated()
    {
        using var context = NewContext();

        var result = await AuthIn(context).RegisterAsync(new AdminRegisterRequestDto { Email = "first@mktba.test", Password = "short" }, Browser);

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("password_too_short");
        (await context.Users.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task GivenAUserWithAnOldShortPassword_WhenSigningIn_ThenItStillWorks()
    {
        using (var seed = NewContext())
        {
            var user = new User { Email = "old@mktba.test", Role = UserRole.Admin };
            user.PasswordHash = new PasswordHasher<User>().HashPassword(user, "short1");
            seed.Users.Add(user);
            await seed.SaveChangesAsync();
        }

        using var context = NewContext();
        var result = await AuthIn(context).LoginAsync(new AdminLoginRequestDto { Email = "old@mktba.test", Password = "short1" }, Browser);

        result.IsSuccess.Should().BeTrue();
    }

    private MktbaDbContext NewContext() => new(new DbContextOptionsBuilder<MktbaDbContext>().UseInMemoryDatabase(_databaseName).Options);

    private static AdminAuthService AuthIn(MktbaDbContext context) => new(
        new UserRepository(context),
        new InviteRepository(context),
        new SessionService(new RefreshSessionRepository(context), new UserRepository(context), Options, TimeProvider.System, NullLogger<SessionService>.Instance),
        TimeProvider.System);
}
