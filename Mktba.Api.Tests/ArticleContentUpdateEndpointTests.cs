using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>
/// #313: <c>PUT /articles/{id}/content</c> takes back the paragraphs and opinions it handed out, with
/// their ids, as the editor sends them on a save without edits or a second save. Runs on both
/// providers.
/// </summary>
public abstract class ArticleContentUpdateEndpointTests
{
    private readonly MktbaApiFactory _factory;

    protected ArticleContentUpdateEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenACreatedArticle_WhenItsOwnContentIsSentBackUnchangedTwice_ThenBothSavesSucceedAndKeepTheIds()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var created = await CreateArticleAsync(admin, $"Без правок {Guid.NewGuid():N}");

        var first = await admin.PutAsJsonAsync($"/articles/{created.Id}/content", created);
        first.StatusCode.Should().Be(HttpStatusCode.NoContent, await first.Content.ReadAsStringAsync());
        var second = await admin.PutAsJsonAsync($"/articles/{created.Id}/content", created);
        second.StatusCode.Should().Be(HttpStatusCode.NoContent, await second.Content.ReadAsStringAsync());

        var saved = await admin.GetFromJsonAsync<ArticleContentDto>($"/articles/{created.Id}/content", ApiJson.Options);
        saved!.Paragraphs.Select(p => (p.Id, p.Order)).Should().Equal(created.Paragraphs.Select(p => (p.Id, p.Order)));
        saved.Paragraphs.SelectMany(p => p.Opinions).Select(o => (o.Id, o.Content, o.IsDefault))
            .Should().Equal(created.Paragraphs.SelectMany(p => p.Opinions).Select(o => (o.Id, o.Content, o.IsDefault)));
    }

    [Fact]
    public async Task GivenAnArticleReadBack_WhenAnOpinionIsEditedWithItsId_ThenTheTextChangesAndTheIdStays()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var created = await CreateArticleAsync(admin, $"Правка мнения {Guid.NewGuid():N}");
        var current = await admin.GetFromJsonAsync<ArticleContentDto>($"/articles/{created.Id}/content", ApiJson.Options);
        var opinion = current!.Paragraphs[0].Opinions[0];
        opinion.Content = "Исправленный текст";

        var response = await admin.PutAsJsonAsync($"/articles/{created.Id}/content", current);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent, await response.Content.ReadAsStringAsync());
        var saved = await admin.GetFromJsonAsync<ArticleContentDto>($"/articles/{created.Id}/content", ApiJson.Options);
        saved!.Paragraphs[0].Opinions.Single().Should().Match<OpinionDto>(o => o.Id == opinion.Id && o.Content == "Исправленный текст");
    }

    [Fact]
    public async Task GivenAParagraphWithSchoolOpinions_WhenOneIsKeptWithAnotherSchoolOneDroppedAndOneAdded_ThenTheKeptOneKeepsItsId()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var schools = (await admin.GetFromJsonAsync<List<SchoolDto>>("/schools/system", ApiJson.Options))!
            .Select(school => school.Id).Take(3).ToList();
        schools.Should().HaveCount(3);
        var response = await admin.PostAsJsonAsync("/articles/content", new ArticleContentCreateDto(
            $"Мнения школ {Guid.NewGuid():N}", null,
            [new ParagraphCreateDto
            {
                Order = 1,
                Opinions = [new OpinionCreateDto("Общее", true, []), new OpinionCreateDto("Первой школы", false, [schools[0]])],
            }],
            null, null, null, null, null));
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
        var opinions = created.Paragraphs[0].Opinions;
        var kept = opinions.Single(o => !o.IsDefault);
        kept.SchoolIds = [schools[1]];
        created.Paragraphs[0].Opinions =
        [
            kept,
            new OpinionDto { Content = "Новое общее", IsDefault = true },
            new OpinionDto { Content = "Третьей школы", SchoolIds = [schools[2]] },
        ];

        var saved = await admin.PutAsJsonAsync($"/articles/{created.Id}/content", created);

        saved.StatusCode.Should().Be(HttpStatusCode.NoContent, await saved.Content.ReadAsStringAsync());
        var current = await admin.GetFromJsonAsync<ArticleContentDto>($"/articles/{created.Id}/content", ApiJson.Options);
        var result = current!.Paragraphs.Single().Opinions;
        result.Select(o => o.Content).Should().BeEquivalentTo("Первой школы", "Новое общее", "Третьей школы");
        result.Single(o => o.Content == "Первой школы").Should().Match<OpinionDto>(o => o.Id == kept.Id && o.SchoolIds.SequenceEqual(new[] { schools[1] }));
        result.Where(o => o.Content != "Первой школы").Select(o => o.Id).Should().NotContain(opinions.Select(o => o.Id));
    }

    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient admin, string title)
    {
        var dto = new ArticleContentCreateDto(
            title, null,
            [
                new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Первый абзац", true, [])] },
                new ParagraphCreateDto { Order = 2, Opinions = [new OpinionCreateDto("Второй абзац", true, [])] },
            ],
            null, null, null, null, null);
        var response = await admin.PostAsJsonAsync("/articles/content", dto);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
    }

    /// <summary>On the InMemory provider.</summary>
    public sealed class InMemory(MktbaApiFactory factory) : ArticleContentUpdateEndpointTests(factory), IClassFixture<MktbaApiFactory>;

    /// <summary>On a real PostgreSQL database (X-07, #161).</summary>
    public sealed class OnPostgres(PostgresApiFactory factory) : ArticleContentUpdateEndpointTests(factory), IClassFixture<PostgresApiFactory>;
}
