using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;

namespace Mktba.Api.Tests;

/// <summary>
/// S-17 (#165): a fresh install has no AI provider (decision D8). The AI endpoints refuse with
/// <c>ai_provider_not_configured</c> and never call out until an admin configures one.
/// </summary>
public sealed class AiProviderNotConfiguredTests
{
    [Fact]
    public async Task GivenFreshInstall_WhenReadingAiSettings_ThenFieldsAreEmptyAndNotConfigured()
    {
        await using var factory = new MktbaApiFactory();
        var client = await RegisterAdminAsync(factory);

        var settings = await client.GetFromJsonAsync<AiProviderSettingsDto>("/admin/ai-settings");

        settings!.BaseUrl.Should().BeEmpty();
        settings.Model.Should().BeEmpty();
        settings.IsConfigured.Should().BeFalse();
    }

    [Theory]
    [InlineData("/admin/ai-style")]
    [InlineData("/admin/ai-check")]
    public async Task GivenFreshInstall_WhenCallingAi_ThenReturns400WithNotConfiguredCodeAndNoOutgoingCall(string path)
    {
        var httpClientFactory = new CountingHttpClientFactory();
        await using var factory = new MktbaApiFactory();
        await using var app = factory.WithWebHostBuilder(builder =>
            builder.ConfigureTestServices(services => services.AddSingleton<IHttpClientFactory>(httpClientFactory)));
        var client = await RegisterAdminAsync(app);

        var response = await client.PostAsJsonAsync(path, new { Text = "Текст" });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        problem.RootElement.GetProperty("code").GetString().Should().Be("ai_provider_not_configured");
        httpClientFactory.CreatedClients.Should().Be(0);
    }

    private static async Task<HttpClient> RegisterAdminAsync(Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> factory)
    {
        var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/auth/register", new { Email = "admin@mktba.test", Password = "Test-password-1" });
        var auth = await response.Content.ReadFromJsonAsync<AdminAuthResponseDto>(ApiJson.Options);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.AccessToken);
        return client;
    }

    private sealed class CountingHttpClientFactory : IHttpClientFactory
    {
        private int _createdClients;

        public int CreatedClients => _createdClients;

        public HttpClient CreateClient(string name)
        {
            Interlocked.Increment(ref _createdClients);
            return new HttpClient();
        }
    }
}
