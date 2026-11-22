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
    public async Task GivenAnAuthor_WhenAsking_ThenIsForbidden()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);

        var response = await author.GetAsync("/analytics/site");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
