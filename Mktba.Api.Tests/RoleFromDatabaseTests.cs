using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>
/// U-01 (#29): the role a request runs with is the user's role in the database, not the one in the
/// token, so tokens issued before a role change (or before roles existed) grant no more than the user has now.
/// </summary>
public sealed class RoleFromDatabaseTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public RoleFromDatabaseTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenASignedInUser_WhenAskingWhoTheyAre_ThenReturnsTheirEmailAndRole()
    {
        var (client, userId) = await RoleClients.CreateAsync(_factory, UserRole.Scholar);

        var me = await client.GetFromJsonAsync<CurrentUserDto>("/auth/me", ApiJson.Options);

        me!.Id.Should().Be(userId);
        me.Role.Should().Be(UserRole.Scholar);
        me.Email.Should().StartWith("scholar-");
    }

    [Fact]
    public async Task GivenAnAdminToken_WhenTheUserIsDemotedToReader_ThenTheSameTokenIsForbidden()
    {
        var (client, userId) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        (await client.GetAsync("/users")).StatusCode.Should().Be(HttpStatusCode.OK);

        await SetRoleAsync(userId, UserRole.Reader);

        (await client.GetAsync("/users")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await client.GetFromJsonAsync<CurrentUserDto>("/auth/me", ApiJson.Options))!.Role.Should().Be(UserRole.Reader);
    }

    [Fact]
    public async Task GivenAReaderToken_WhenTheUserIsPromotedToAdmin_ThenTheSameTokenIsAllowed()
    {
        var (client, userId) = await RoleClients.CreateAsync(_factory, UserRole.Reader);
        (await client.GetAsync("/users")).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        await SetRoleAsync(userId, UserRole.Admin);

        (await client.GetAsync("/users")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GivenATokenOfADeletedUser_WhenCallingAnyProtectedEndpoint_ThenReturnsUnauthorized()
    {
        var (client, userId) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
            db.Users.Remove(db.Users.Single(user => user.Id == userId));
            await db.SaveChangesAsync();
        }

        (await client.GetAsync("/users")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await client.GetAsync("/auth/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GivenAFreshInstall_WhenTheFirstUserRegisters_ThenTheyAreAnAdmin()
    {
        await using var factory = new MktbaApiFactory();
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/auth/register", new { Email = "first@mktba.test", Password = "Test-password-1" });

        var auth = await response.Content.ReadFromJsonAsync<AdminAuthResponseDto>(ApiJson.Options);
        auth!.Role.Should().Be(UserRole.Admin);
    }

    private async Task SetRoleAsync(int userId, UserRole role)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
        db.Users.Single(user => user.Id == userId).Role = role;
        await db.SaveChangesAsync();
    }
}
