using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>Signs in as a user of a given role, created straight in the database (no invite flow).</summary>
internal static class RoleClients
{
    private const string Password = "Test-password-1";

    /// <summary>A client carrying a token of a new user with <paramref name="role"/>, and that user's id.</summary>
    public static async Task<(HttpClient Client, int UserId)> CreateAsync(MktbaApiFactory factory, UserRole role)
    {
        var email = $"{role.ToString().ToLowerInvariant()}-{Guid.NewGuid():N}@mktba.test";
        int userId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
            var user = new User { Email = email, Role = role };
            user.PasswordHash = new PasswordHasher<User>().HashPassword(user, Password);
            db.Users.Add(user);
            await db.SaveChangesAsync();
            userId = user.Id;
        }

        var client = factory.CreateClient();
        var login = await client.PostAsJsonAsync("/auth/login", new { Email = email, Password });
        login.EnsureSuccessStatusCode();
        var auth = await login.Content.ReadFromJsonAsync<AdminAuthResponseDto>(ApiJson.Options);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.AccessToken);
        return (client, userId);
    }
}
