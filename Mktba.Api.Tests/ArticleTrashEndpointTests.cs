using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>M-11 (#133): deleting an article moves it to the trash; only an admin lists, restores and purges it.</summary>
public sealed class ArticleTrashEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public ArticleTrashEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenAdmin_WhenTrashingRestoringAndPurging_ThenTheArticleMovesThroughTheTrash()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var created = await CreateArticleAsync(admin, $"Корзина {Guid.NewGuid():N}");

        (await admin.DeleteAsync($"/articles/{created.Id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await admin.GetAsync($"/articles/{created.Id}/content")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        var trash = await admin.GetFromJsonAsync<List<ArticleTrashItemDto>>("/articles/trash", ApiJson.Options);
        trash.Should().Contain(item => item.Id == created.Id && item.Slug == created.Slug);

        (await admin.PostAsync($"/articles/trash/{created.Id}/restore", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await admin.GetAsync($"/articles/{created.Id}/content")).StatusCode.Should().Be(HttpStatusCode.OK);

        var purgeLive = await admin.DeleteAsync($"/articles/trash/{created.Id}");
        purgeLive.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await ApiJson.ReadCodeAsync(purgeLive)).Should().Be("article_not_in_trash");

        (await admin.DeleteAsync($"/articles/{created.Id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await admin.DeleteAsync($"/articles/trash/{created.Id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await admin.GetFromJsonAsync<List<ArticleTrashItemDto>>("/articles/trash", ApiJson.Options))
            .Should().NotContain(item => item.Id == created.Id);
    }

    [Fact]
    public async Task GivenSectionWithChild_WhenTrashed_ThenReturns400ArticleHasChildren()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var parent = await CreateArticleAsync(admin, $"Раздел {Guid.NewGuid():N}");
        await CreateArticleAsync(admin, $"Дочерняя {Guid.NewGuid():N}", parent.Id);

        var response = await admin.DeleteAsync($"/articles/{parent.Id}");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("article_has_children");
    }

    [Fact]
    public async Task GivenAuthor_WhenUsingTheTrash_ThenReturnsForbidden()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var created = await CreateArticleAsync(admin, $"Чужая корзина {Guid.NewGuid():N}");
        (await admin.DeleteAsync($"/articles/{created.Id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);

        (await author.GetAsync("/articles/trash")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await author.PostAsync($"/articles/trash/{created.Id}/restore", null)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await author.DeleteAsync($"/articles/trash/{created.Id}")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await _factory.CreateClient().GetAsync("/articles/trash")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient client, string title, int? parentId = null)
    {
        var dto = new ArticleContentCreateDto(
            title, parentId, [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
            null, null, null, null, null);
        var response = await client.PostAsJsonAsync("/articles/content", dto);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
    }
}
