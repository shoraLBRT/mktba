using System.Net;
using System.Net.Http.Json;
using System.Text;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>
/// F-02 (#67): <c>POST /feedback</c> over HTTP. The test host has no issue tracker
/// (<see cref="MktbaApiFactory"/>), which is also the state of an installation without a GitHub App:
/// the message is accepted and waits.
/// </summary>
public sealed class FeedbackEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public FeedbackEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenAnonymousVisitor_WhenPostingFeedback_ThenReturns202AndMessageWaitsPending()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/feedback", new
        {
            type = "SiteProblem",
            text = "Не работает поиск по сайту.",
            contact = "t.me/reader",
            pageUrl = "https://mktba.ru/search?q=test",
            mazhab = "hanafi",
        });

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);
        var accepted = await response.Content.ReadFromJsonAsync<FeedbackAcceptedDto>(ApiJson.Options);
        using var scope = _factory.Services.CreateScope();
        var stored = await scope.ServiceProvider.GetRequiredService<MktbaDbContext>().FeedbackMessages.SingleAsync(f => f.Id == accepted!.Id);
        stored.Type.Should().Be(FeedbackType.SiteProblem);
        stored.Text.Should().Be("Не работает поиск по сайту.");
        stored.Contact.Should().Be("t.me/reader");
        stored.Mazhab.Should().Be("hanafi");
        stored.DeliveryState.Should().Be(FeedbackDeliveryState.Pending);
        stored.Attempts.Should().Be(0);
        stored.GitHubIssueNumber.Should().BeNull();
    }

    [Theory]
    [InlineData("""{"text":"Без типа"}""", "feedback_type_invalid")]
    [InlineData("""{"type":"Idea"}""", "feedback_text_required")]
    [InlineData("""{"type":"Idea","text":"   "}""", "feedback_text_required")]
    [InlineData("""{"type":"Idea","text":"Текст","pageUrl":"ftp://example.com/x"}""", "feedback_page_url_invalid")]
    [InlineData("""{"type":"Complaint","text":"Неизвестный тип"}""", "bad_request")]
    [InlineData("""{"type":"Idea","text":"Текст","articleId":"abc"}""", "bad_request")]
    [InlineData("not json", "bad_request")]
    public async Task GivenInvalidBody_WhenPostingFeedback_ThenReturns400WithCode(string json, string code)
    {
        var response = await _factory.CreateClient().PostAsync("/feedback", new StringContent(json, Encoding.UTF8, "application/json"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(response)).Should().Be(code);
    }

    [Fact]
    public async Task GivenTextOverTheLimit_WhenPostingFeedback_ThenReturns400WithTheLimit()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/feedback", new { type = "Idea", text = new string('а', 4001) });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        problem.GetProperty("code").GetString().Should().Be("feedback_text_too_long");
        problem.GetProperty("params").GetProperty("maxLength").GetInt32().Should().Be(4000);
    }
}
