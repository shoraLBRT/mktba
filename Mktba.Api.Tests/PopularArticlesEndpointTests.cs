using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>R-05 (#41): <c>GET /articles/popular</c> lists the most viewed articles, to anyone.</summary>
public sealed class PopularArticlesEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public PopularArticlesEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenViewedPublishedAndDraftArticles_WhenAnonymousReadsPopular_ThenOnlyThePublishedOnesAreListedMostViewedFirst()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var top = await CreateArticleAsync(admin, "Популярная первая");
        await ApiJson.PublishAsync(admin, top.Id);
        var second = await CreateArticleAsync(admin, "Популярная вторая");
        await ApiJson.PublishAsync(admin, second.Id);
        var draft = await CreateArticleAsync(admin, "Популярный черновик");
        await AddViewsAsync((top.Id, 1000), (second.Id, 999), (draft.Id, 5000));

        var response = await _factory.CreateClient().GetAsync("/articles/popular");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var popular = (await response.Content.ReadFromJsonAsync<PopularArticlesDto>(ApiJson.Options))!;
        popular.Days.Should().Be(30);
        var ids = popular.Items.Select(article => article.Id).ToList();
        ids.Should().NotContain(draft.Id);
        ids.Take(2).Should().Equal(top.Id, second.Id);
        popular.Items[0].Title.Should().Be("Популярная первая");
    }

    [Fact]
    public async Task GivenUnsupportedLocale_WhenReadingPopular_ThenReturns400WithLocaleUnsupportedCode()
    {
        var response = await _factory.CreateClient().GetAsync("/articles/popular?locale=fr");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("locale_unsupported");
    }

    private async Task AddViewsAsync(params (int ArticleId, int Views)[] views)
    {
        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        dbContext.AnalyticsArticleDays.AddRange(views.Select(v => new AnalyticsArticleDay
        {
            ArticleId = v.ArticleId,
            Day = today,
            Views = v.Views,
            Readers = v.Views,
        }));
        await dbContext.SaveChangesAsync();
    }

    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient client, string title)
    {
        var dto = new ArticleContentCreateDto(
            title, null, [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
            null, null, null, null, null);
        var response = await client.PostAsJsonAsync("/articles/content", dto);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
    }
}
