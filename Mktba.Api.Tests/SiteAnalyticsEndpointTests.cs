using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Application.Services.Analytics;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>N-05 (#99): <c>GET /analytics/site</c>, the admin dashboard's site-wide statistics.</summary>
public sealed class SiteAnalyticsEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public SiteAnalyticsEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenAnAdmin_WhenAskingWithoutDays_ThenGetsTheLastThirtyDaysEndingToday()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);

        var result = await admin.GetFromJsonAsync<SiteAnalyticsDto>("/analytics/site", ApiJson.Options);

        result!.Days.Should().Be(SiteAnalyticsService.DefaultDays);
        result.Daily.Should().HaveCount(SiteAnalyticsService.DefaultDays);
        result.To.Should().Be(DateOnly.FromDateTime(DateTime.UtcNow));
    }

    [Fact]
    public async Task GivenAnAdmin_WhenAskingForSevenDays_ThenGetsSevenDays()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);

        var result = await admin.GetFromJsonAsync<SiteAnalyticsDto>("/analytics/site?days=7", ApiJson.Options);

        result!.Daily.Should().HaveCount(7);
    }

    [Fact]
    public async Task GivenAnAdmin_WhenAskingForARange_ThenGetsThoseDaysAndTheTotalsBefore()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);

        var result = await admin.GetFromJsonAsync<SiteAnalyticsDto>("/analytics/site?from=2026-01-01&to=2026-01-31", ApiJson.Options);

        result!.Days.Should().Be(31);
        result.From.Should().Be(new DateOnly(2026, 1, 1));
        result.To.Should().Be(new DateOnly(2026, 1, 31));
        result.Daily.Should().HaveCount(31);
        result.Previous.From.Should().Be(new DateOnly(2025, 12, 1));
        result.Previous.To.Should().Be(new DateOnly(2025, 12, 31));
    }

    [Theory]
    [InlineData("from=2026-02-01&to=2026-01-01", "analytics_period_invalid")]
    [InlineData("from=2024-01-01&to=2025-12-31", "analytics_period_too_long")]
    [InlineData("from=yesterday", "bad_request")]
    public async Task GivenAnAdmin_WhenAskingForABadRange_ThenReturns400WithCode(string query, string code)
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);

        var response = await admin.GetAsync("/analytics/site?" + query);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(response)).Should().Be(code);
    }

    [Fact]
    public async Task GivenAnAuthor_WhenAsking_ThenIsForbidden()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);

        var response = await author.GetAsync("/analytics/site");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
