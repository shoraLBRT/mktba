using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Application.Services.Analytics;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>N-07 (#101): <c>GET /analytics/content</c>, the content analytics of the admin dashboard.</summary>
public sealed class ContentAnalyticsEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public ContentAnalyticsEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenAnAdmin_WhenAskingWithoutDays_ThenGetsTheLastThirtyDaysWithTheStubReadersReached()
    {
        // A final day in the past: the aggregation worker leaves it alone.
        var day = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-3);
        int stubId;
        using (var scope = _factory.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
            var stub = new Article { Title = "Заглушка", Slug = "content-analytics-stub", Status = ArticleStatus.Published, PublishedAt = DateTime.UtcNow.AddDays(-60) };
            context.Articles.Add(stub);
            await context.SaveChangesAsync();
            stubId = stub.Id;
            context.AnalyticsDays.Add(new AnalyticsDay { Day = day, ArticleViews = 6, Visitors = 4, IsFinal = true, AggregatedAtUtc = DateTime.UtcNow });
            context.AnalyticsArticleDays.Add(new AnalyticsArticleDay { ArticleId = stubId, Day = day, Views = 6, Readers = 4 });
            await context.SaveChangesAsync();
        }

        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var result = await admin.GetFromJsonAsync<ContentAnalyticsDto>("/analytics/content", ApiJson.Options);

        result!.Days.Should().Be(ContentAnalyticsService.DefaultDays);
        result.To.Should().Be(DateOnly.FromDateTime(DateTime.UtcNow));
        result.StaleAfterDays.Should().Be(365);
        result.StubsWithTraffic.Items.Should().ContainSingle(a => a.ArticleId == stubId)
            .Which.Views.Should().Be(6);
    }

    [Fact]
    public async Task GivenAnAuthor_WhenAsking_ThenIsForbidden()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);

        var response = await author.GetAsync("/analytics/content");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
