using System.Net;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;
using Mktba.Infrastructure.UnitOfWork;

namespace Mktba.Application.Tests;

/// <summary>S-17 (#165): there is no default AI provider; AI stays off until an admin configures one (D8).</summary>
public class AiProviderNotConfiguredTests : IDisposable
{
    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly CountingHttpClientFactory _httpClientFactory = new();
    private readonly AdminService _service;

    public AiProviderNotConfiguredTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        _service = new AdminService(
            new ArticleRepository(_context),
            new ParagraphRepository(_context),
            new AiProviderSettingsRepository(_context),
            new UnitOfWork(_context),
            _httpClientFactory,
            Options.Create(new AdminOptions()),
            NullLogger<AdminService>.Instance);
    }

    public void Dispose() => _context.Dispose();

    [Fact]
    public async Task GivenFreshInstall_WhenReadingAiSettings_ThenEverythingIsEmptyAndNotConfigured()
    {
        var settings = await _service.GetAiSettingsAsync();

        settings.BaseUrl.Should().BeEmpty();
        settings.Model.Should().BeEmpty();
        settings.HasApiKey.Should().BeFalse();
        settings.IsEnabled.Should().BeFalse();
        settings.IsConfigured.Should().BeFalse();
    }

    [Fact]
    public async Task GivenFreshInstall_WhenStylingText_ThenRefusesWithNotConfiguredWithoutCallingOut()
    {
        var result = await _service.StyleMarkdownAsync("Текст");

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be(AppErrors.AiProviderNotConfigured.Code);
        _httpClientFactory.CreatedClients.Should().Be(0);
    }

    [Fact]
    public async Task GivenEnabledSettingsWithoutApiKey_WhenCheckingConnection_ThenRefusesWithNotConfiguredWithoutCallingOut()
    {
        await SaveSettingsAsync(new AiProviderSettings { BaseUrl = "https://example.test/v1", Model = "model", IsEnabled = true });

        var result = await _service.CheckAiConnectionAsync();

        result.Error!.Code.Should().Be(AppErrors.AiProviderNotConfigured.Code);
        _httpClientFactory.CreatedClients.Should().Be(0);
    }

    [Fact]
    public async Task GivenKeyButNoModel_WhenReadingAiSettings_ThenNotConfigured()
    {
        await SaveSettingsAsync(new AiProviderSettings { BaseUrl = "https://example.test/v1", ApiKey = "key", IsEnabled = true });

        var settings = await _service.GetAiSettingsAsync();

        settings.IsConfigured.Should().BeFalse();
    }

    [Fact]
    public async Task GivenConfiguredButDisabledProvider_WhenStylingText_ThenRefusesAsDisabled()
    {
        await SaveSettingsAsync(new AiProviderSettings { BaseUrl = "https://example.test/v1", Model = "model", ApiKey = "key" });

        var settings = await _service.GetAiSettingsAsync();
        var result = await _service.StyleMarkdownAsync("Текст");

        settings.IsConfigured.Should().BeTrue();
        result.Error!.Code.Should().Be(AppErrors.AiDisabled.Code);
        _httpClientFactory.CreatedClients.Should().Be(0);
    }

    [Fact]
    public async Task GivenConfiguredProvider_WhenResettingSettings_ThenSettingsAreEmptyAgain()
    {
        await _service.UpdateAiSettingsAsync(new UpdateAiProviderSettingsDto
        {
            BaseUrl = "https://example.test/v1",
            Model = "model",
            ApiKey = "key",
            IsEnabled = true,
        });

        var settings = await _service.ResetAiSettingsAsync();

        settings.BaseUrl.Should().BeEmpty();
        settings.Model.Should().BeEmpty();
        settings.IsConfigured.Should().BeFalse();
    }

    private async Task SaveSettingsAsync(AiProviderSettings settings)
    {
        _context.AiProviderSettings.Add(settings);
        await _context.SaveChangesAsync();
    }

    private sealed class CountingHttpClientFactory : IHttpClientFactory
    {
        public int CreatedClients { get; private set; }

        public HttpClient CreateClient(string name)
        {
            CreatedClients++;
            return new HttpClient(new RefusingHandler());
        }
    }

    private sealed class RefusingHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(new HttpResponseMessage(HttpStatusCode.InternalServerError));
    }
}
