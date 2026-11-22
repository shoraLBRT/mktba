using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Application.Services;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>P-04 (#92): <c>GET /profile/activity</c> gives the signed-in user their own edits and publications by week.</summary>
public sealed class UserActivityEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public UserActivityEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenAuthorWhoSavedAndGotPublished_WhenReadingOwnActivity_ThenTheCurrentWeekCountsBoth()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var article = await CreateArticleAsync(author);
        await ApiJson.PublishAsync(admin, article.Id);

        var activity = await author.GetFromJsonAsync<UserActivityDto>("/profile/activity", ApiJson.Options);
        var adminActivity = await admin.GetFromJsonAsync<UserActivityDto>("/profile/activity?weeks=4", ApiJson.Options);

        activity!.Weeks.Should().HaveCount(UserActivityService.DefaultWeeks);
        activity.Weeks[^1].WeekStart.Should().Be(UserActivityService.WeekStartOf(DateTime.UtcNow));
        activity.Weeks[^1].Edits.Should().Be(1);
        activity.Weeks[^1].Publications.Should().Be(1);
        adminActivity!.Weeks.Should().HaveCount(4).And.OnlyContain(week => week.Edits == 0 && week.Publications == 0);
    }

    [Fact]
    public async Task GivenNoSignIn_WhenReadingActivity_ThenReturns401()
    {
        var response = await _factory.CreateClient().GetAsync("/profile/activity");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient client)
    {
        var dto = new ArticleContentCreateDto(
            $"Статья активности {Guid.NewGuid().ToString("N")[..8]}", null,
            [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
            null, null, null, null);
        var response = await client.PostAsJsonAsync("/articles/content", dto, ApiJson.Options);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
    }
}
