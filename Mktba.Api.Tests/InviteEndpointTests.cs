using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>U-04 (#32): an invite carries a role and an expiry, is single-use and can be revoked.</summary>
public sealed class InviteEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public InviteEndpointTests(MktbaApiFactory factory) => _factory = factory;

    [Fact]
    public async Task GivenAnAuthorInvite_WhenSomeoneRegistersWithIt_ThenTheyAreAnAuthorAndTheInviteIsUsed()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var invite = await CreateInviteAsync(admin, new { Role = "Author", LifetimeHours = 48, Note = "Для Ахмада" });
        invite.Role.Should().Be(UserRole.Author);

        var client = _factory.CreateClient();
        var email = $"author-{Guid.NewGuid():N}@mktba.test";
        var register = await RegisterAsync(client, email, invite.Token);
        register.StatusCode.Should().Be(HttpStatusCode.OK);
        var auth = await register.Content.ReadFromJsonAsync<AdminAuthResponseDto>(ApiJson.Options);
        client.DefaultRequestHeaders.Authorization = new("Bearer", auth!.AccessToken);
        var me = await client.GetFromJsonAsync<CurrentUserDto>("/auth/me", ApiJson.Options);
        me!.Role.Should().Be(UserRole.Author);

        var listed = (await admin.GetFromJsonAsync<List<InviteDto>>("/invites/", ApiJson.Options))!.Single(i => i.Id == invite.Id);
        listed.Status.Should().Be(InviteStatus.Used);
        listed.UsedByEmail.Should().Be(email);
        listed.Note.Should().Be("Для Ахмада");
        listed.ExpiresAtUtc.Should().BeCloseTo(DateTime.UtcNow.AddHours(48), TimeSpan.FromMinutes(1));
    }

    [Fact]
    public async Task GivenAUsedInvite_WhenSomeoneElseRegistersWithIt_ThenTheyAreRefusedWithInviteUsed()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var invite = await CreateInviteAsync(admin, new { Role = "Reader" });
        (await RegisterAsync(_factory.CreateClient(), $"first-{Guid.NewGuid():N}@mktba.test", invite.Token)).EnsureSuccessStatusCode();

        var second = await RegisterAsync(_factory.CreateClient(), $"second-{Guid.NewGuid():N}@mktba.test", invite.Token);

        await ShouldBeErrorAsync(second, HttpStatusCode.BadRequest, "invite_used");
    }

    [Fact]
    public async Task GivenARevokedInvite_WhenSomeoneRegistersWithIt_ThenTheyAreRefusedWithInviteRevoked()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var invite = await CreateInviteAsync(admin, new { Role = "Scholar" });
        (await admin.PostAsync($"/invites/{invite.Id}/revoke", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var register = await RegisterAsync(_factory.CreateClient(), $"scholar-{Guid.NewGuid():N}@mktba.test", invite.Token);

        await ShouldBeErrorAsync(register, HttpStatusCode.BadRequest, "invite_revoked");
        var listed = (await admin.GetFromJsonAsync<List<InviteDto>>("/invites/", ApiJson.Options))!.Single(i => i.Id == invite.Id);
        listed.Status.Should().Be(InviteStatus.Revoked);
    }

    [Fact]
    public async Task GivenAnExpiredInvite_WhenSomeoneRegistersWithIt_ThenTheyAreRefusedWithInviteExpired()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var invite = await CreateInviteAsync(admin, new { Role = "Author" });
        await WithDbAsync(async db =>
        {
            var stored = await db.Invites.SingleAsync(i => i.Id == invite.Id);
            stored.ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        });

        var register = await RegisterAsync(_factory.CreateClient(), $"late-{Guid.NewGuid():N}@mktba.test", invite.Token);

        await ShouldBeErrorAsync(register, HttpStatusCode.BadRequest, "invite_expired");
    }

    [Fact]
    public async Task GivenAnUnknownOrMissingToken_WhenRegisteringAfterTheFirstAdmin_ThenTheyAreRefusedWithInviteNotFound()
    {
        await RoleClients.CreateAsync(_factory, UserRole.Admin);

        await ShouldBeErrorAsync(await RegisterAsync(_factory.CreateClient(), $"x-{Guid.NewGuid():N}@mktba.test", "DEADBEEF"), HttpStatusCode.BadRequest, "invite_not_found");
        await ShouldBeErrorAsync(await RegisterAsync(_factory.CreateClient(), $"y-{Guid.NewGuid():N}@mktba.test", null), HttpStatusCode.BadRequest, "invite_not_found");
    }

    [Fact]
    public async Task GivenACreatedInvite_WhenItIsStored_ThenOnlyTheTokenHashIsKeptAndTheListNeverCarriesTheToken()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var invite = await CreateInviteAsync(admin, new { Role = "Admin" });

        await WithDbAsync(async db =>
        {
            var stored = await db.Invites.AsNoTracking().SingleAsync(i => i.Id == invite.Id);
            stored.TokenHash.Should().NotBe(invite.Token).And.NotContain(invite.Token);
            stored.TokenHash.Should().Be(Mktba.Application.Services.SessionService.HashToken(invite.Token));
        });
        var list = await admin.GetStringAsync("/invites/");
        list.Should().NotContain(invite.Token);
    }

    [Theory]
    [InlineData("{\"role\":\"Author\",\"lifetimeHours\":0}", "invite_lifetime_invalid")]
    [InlineData("{\"role\":\"Author\",\"lifetimeHours\":721}", "invite_lifetime_invalid")]
    [InlineData("{\"role\":\"Owner\"}", "bad_request")]
    public async Task GivenAnInvalidInviteRequest_WhenCreating_ThenItIsRefused(string body, string code)
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);

        var response = await admin.PostAsync("/invites/", new StringContent(body, System.Text.Encoding.UTF8, "application/json"));

        await ShouldBeErrorAsync(response, HttpStatusCode.BadRequest, code);
    }

    [Fact]
    public async Task GivenAUsedInvite_WhenRevoking_ThenItIsRefusedWithInviteUsed()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var invite = await CreateInviteAsync(admin, new { Role = "Reader" });
        (await RegisterAsync(_factory.CreateClient(), $"r-{Guid.NewGuid():N}@mktba.test", invite.Token)).EnsureSuccessStatusCode();

        await ShouldBeErrorAsync(await admin.PostAsync($"/invites/{invite.Id}/revoke", null), HttpStatusCode.BadRequest, "invite_used");
        await ShouldBeErrorAsync(await admin.PostAsync("/invites/987654/revoke", null), HttpStatusCode.NotFound, "invite_not_found");
    }

    [Fact]
    public async Task GivenAnAuthor_WhenAnAdminMakesThemAScholar_ThenTheirNextRequestCarriesTheNewRole()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (author, authorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);

        var response = await admin.PutAsJsonAsync($"/users/{authorId}/role", new { Role = "Scholar" });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await author.GetFromJsonAsync<CurrentUserDto>("/auth/me", ApiJson.Options))!.Role.Should().Be(UserRole.Scholar);
        var users = await admin.GetFromJsonAsync<List<UserSummaryDto>>("/users/", ApiJson.Options);
        users!.Single(u => u.Id == authorId).Role.Should().Be(UserRole.Scholar);
        await ShouldBeErrorAsync(await admin.PutAsJsonAsync("/users/987654/role", new { Role = "Reader" }), HttpStatusCode.NotFound, "user_not_found");
    }

    [Fact]
    public async Task GivenTheOnlyAdmin_WhenDemotingThemselves_ThenItIsRefusedWithLastAdminDemotion()
    {
        await using var factory = new MktbaApiFactory();
        var (admin, adminId) = await RoleClients.CreateAsync(factory, UserRole.Admin);

        var response = await admin.PutAsJsonAsync($"/users/{adminId}/role", new { Role = "Author" });

        await ShouldBeErrorAsync(response, HttpStatusCode.BadRequest, "last_admin_demotion");
        (await admin.GetFromJsonAsync<CurrentUserDto>("/auth/me", ApiJson.Options))!.Role.Should().Be(UserRole.Admin);
    }

    [Fact]
    public async Task GivenTwoAdmins_WhenOneDemotesTheOther_ThenTheDemotedAdminLosesAdminAccess()
    {
        await using var factory = new MktbaApiFactory();
        var (admin, _) = await RoleClients.CreateAsync(factory, UserRole.Admin);
        var (other, otherId) = await RoleClients.CreateAsync(factory, UserRole.Admin);

        (await admin.PutAsJsonAsync($"/users/{otherId}/role", new { Role = "Reader" })).StatusCode.Should().Be(HttpStatusCode.OK);

        (await other.GetAsync("/invites/")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    private static async Task<InviteCreatedDto> CreateInviteAsync(HttpClient admin, object request)
    {
        var response = await admin.PostAsJsonAsync("/invites/", request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<InviteCreatedDto>(ApiJson.Options))!;
    }

    private static Task<HttpResponseMessage> RegisterAsync(HttpClient client, string email, string? inviteToken)
        => client.PostAsJsonAsync("/auth/register", new { Email = email, Password = RoleClients.Password, InviteToken = inviteToken });

    private async Task WithDbAsync(Func<MktbaDbContext, Task> action)
    {
        using var scope = _factory.Services.CreateScope();
        await action(scope.ServiceProvider.GetRequiredService<MktbaDbContext>());
    }

    private static async Task ShouldBeErrorAsync(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        response.StatusCode.Should().Be(status);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("code").GetString().Should().Be(code);
    }
}
