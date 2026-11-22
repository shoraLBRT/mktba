using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Application.Services.Analytics;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>N-06 (#100): <c>GET /analytics/search</c>, the search analytics of the admin dashboard.</summary>
public sealed class SearchAnalyticsEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public SearchAnalyticsEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenAnAdmin_WhenAskingWithoutDays_ThenGetsTheLastThirtyDaysAndOnlyQueriesOfSeveralVisitors()
    {
        // A final day in the past: the aggregation worker leaves it alone.
        var day = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-3);
        using (var scope = _factory.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
            context.AnalyticsDays.Add(new AnalyticsDay { Day = day, Searches = 9, SearchesWithoutResults = 6, IsFinal = true, AggregatedAtUtc = DateTime.UtcNow });
            context.AnalyticsSearchDays.AddRange(
                new AnalyticsSearchDay { Day = day, Query = "закят с золота", Searches = 4, Searchers = 3, SearchesWithoutResults = 4 },
                new AnalyticsSearchDay { Day = day, Query = "намаз", Searches = 3, Searchers = 2, SearchesWithoutResults = 0 },
                new AnalyticsSearchDay { Day = day, Query = "редкая фраза одного человека", Searches = 2, Searchers = 1, SearchesWithoutResults = 2 });
            await context.SaveChangesAsync();
        }

        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var result = await admin.GetFromJsonAsync<SearchAnalyticsDto>("/analytics/search", ApiJson.Options);

        result!.Days.Should().Be(SearchAnalyticsService.DefaultDays);
        result.To.Should().Be(DateOnly.FromDateTime(DateTime.UtcNow));
        result.MinSearchers.Should().Be(2);
        result.Totals.Should().Be(new SearchAnalyticsTotalsDto(9, 6));
        result.TopQueries.Select(q => q.Query).Should().Equal("закят с золота", "намаз");
        result.QueriesWithoutResults.Should().Equal(new SearchQueryTotalDto("закят с золота", 4, 3, 4));
    }

    [Fact]
    public async Task GivenAnAuthor_WhenAsking_ThenIsForbidden()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);

        var response = await author.GetAsync("/analytics/search");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
