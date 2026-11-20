using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>M-06 (#70): the tag page over HTTP, and an admin's merge as readers see it.</summary>
public sealed class TagEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public TagEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenAPublishedTaggedArticle_WhenAReaderOpensTheTag_ThenTheArticleIsListedAndItsContentLinksTheTag()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var name = $"Тег {Guid.NewGuid().ToString("N")[..8]}";
        var article = await CreateArticleAsync(admin, "Статья с тегом", [name]);
        await ApiJson.PublishAsync(admin, article.Id);
        var anonymous = _factory.CreateClient();

        var content = await anonymous.GetFromJsonAsync<ArticleContentDto>($"/articles/{article.Id}/content", ApiJson.Options);
        var tag = content!.TagLinks.Should().ContainSingle().Subject;
        tag.Name.Should().Be(name);
        var page = await anonymous.GetFromJsonAsync<TagPageDto>($"/tags/{tag.Slug}", ApiJson.Options);

        page!.Name.Should().Be(name);
        page.Items.Select(item => item.Id).Should().Equal(article.Id);
    }

    [Fact]
    public async Task GivenTwoTags_WhenAnAdminMergesThem_ThenTheMergedTagsPageIsGoneAndTheArticleCarriesTheOther()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var article = await CreateArticleAsync(admin, "Статья", [$"Опечатка {suffix}", $"Верный {suffix}"]);
        await ApiJson.PublishAsync(admin, article.Id);
        var tags = (await admin.GetFromJsonAsync<List<TagDto>>("/tags?locale=ru", ApiJson.Options))!;
        var typo = tags.Single(t => t.Name == $"Опечатка {suffix}");
        var right = tags.Single(t => t.Name == $"Верный {suffix}");

        var merge = await admin.PostAsJsonAsync($"/tags/{typo.Id}/merge", new TagMergeDto(right.Id), ApiJson.Options);
        var gone = await _factory.CreateClient().GetAsync($"/tags/{typo.Slug}");

        merge.StatusCode.Should().Be(HttpStatusCode.OK);
        gone.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await ApiJson.ReadCodeAsync(gone)).Should().Be("tag_not_found");
        var content = await admin.GetFromJsonAsync<ArticleContentDto>($"/articles/{article.Id}/content", ApiJson.Options);
        content!.Tags.Should().Equal($"Верный {suffix}");
    }

    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient client, string title, List<string> tags)
    {
        var dto = new ArticleContentCreateDto(
            $"{title} {Guid.NewGuid().ToString("N")[..8]}", null,
            [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
            null, null, tags, null);
        var response = await client.PostAsJsonAsync("/articles/content", dto, ApiJson.Options);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
    }
}
