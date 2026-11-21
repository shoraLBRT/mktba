using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Mktba.Application.DTOs;

namespace Mktba.Api.Tests;

/// <summary>M-05 (#26): admins reorder articles and change their parent; the tree follows the order.</summary>
public sealed class ArticleOrderEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public ArticleOrderEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenSiblings_WhenMovedToIndex_ThenTreeListsThemInTheNewOrder()
    {
        var admin = await CreateAdminClientAsync();
        var parent = await CreateAsync(admin, "Раздел порядка");
        var first = await CreateAsync(admin, "Первая", parent.Id);
        await CreateAsync(admin, "Вторая", parent.Id);
        await CreateAsync(admin, "Третья", parent.Id);

        var response = await admin.PostAsJsonAsync($"/articles/{first.Id}/move", new ArticleMoveDto { ParentArticleId = parent.Id, Index = 2 });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await response.Content.ReadFromJsonAsync<ArticleReadDto>(ApiJson.Options))!.Order.Should().Be(2);
        (await ChildTitlesAsync(admin, parent.Id)).Should().Equal("Вторая", "Третья", "Первая");
    }

    [Fact]
    public async Task GivenArticle_WhenMovedUnderAnotherParent_ThenItAppearsThere()
    {
        var admin = await CreateAdminClientAsync();
        var from = await CreateAsync(admin, "Откуда");
        var to = await CreateAsync(admin, "Куда");
        var moved = await CreateAsync(admin, "Переезжающая", from.Id);
        await CreateAsync(admin, "Местная", to.Id);

        var response = await admin.PostAsJsonAsync($"/articles/{moved.Id}/move", new ArticleMoveDto { ParentArticleId = to.Id, Index = 0 });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await ChildTitlesAsync(admin, to.Id)).Should().Equal("Переезжающая", "Местная");
        (await ChildTitlesAsync(admin, from.Id)).Should().BeEmpty();
    }

    [Fact]
    public async Task GivenDescendantAsParent_WhenMoving_ThenReturns400Cycle()
    {
        var admin = await CreateAdminClientAsync();
        var top = await CreateAsync(admin, "Верхняя");
        var child = await CreateAsync(admin, "Нижняя", top.Id);

        var response = await admin.PostAsJsonAsync($"/articles/{top.Id}/move", new ArticleMoveDto { ParentArticleId = child.Id });

        await AssertProblemAsync(response, HttpStatusCode.BadRequest, "article_move_cycle");
    }

    [Fact]
    public async Task GivenUnknownParent_WhenMoving_ThenReturns400ParentNotFound()
    {
        var admin = await CreateAdminClientAsync();
        var article = await CreateAsync(admin, "Сирота");

        var response = await admin.PostAsJsonAsync($"/articles/{article.Id}/move", new ArticleMoveDto { ParentArticleId = 987654 });

        await AssertProblemAsync(response, HttpStatusCode.BadRequest, "article_parent_not_found");
    }

    [Fact]
    public async Task GivenAnonymousCaller_WhenMoving_ThenReturns401()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/articles/1/move", new ArticleMoveDto());

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GivenArticleUnderParent_WhenRenamedWithTheSameParent_ThenTreeShowsTheNewTitleInPlace()
    {
        var admin = await CreateAdminClientAsync();
        var parent = await CreateAsync(admin, "Раздел переименования");
        var first = await CreateAsync(admin, "Старое имя", parent.Id);
        await CreateAsync(admin, "Соседка", parent.Id);

        var response = await admin.PutAsJsonAsync($"/articles/{first.Id}", new ArticleUpdateDto { Title = " Новое имя ", ParentArticleId = parent.Id });

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await ChildTitlesAsync(admin, parent.Id)).Should().Equal("Новое имя", "Соседка");
    }

    [Fact]
    public async Task GivenBlankTitle_WhenRenaming_ThenReturns400TitleRequired()
    {
        var admin = await CreateAdminClientAsync();
        var article = await CreateAsync(admin, "Без имени не оставить");

        var response = await admin.PutAsJsonAsync($"/articles/{article.Id}", new ArticleUpdateDto { Title = "  " });

        await AssertProblemAsync(response, HttpStatusCode.BadRequest, "article_title_required");
    }

    private static async Task AssertProblemAsync(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        response.StatusCode.Should().Be(status);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        problem.GetProperty("code").GetString().Should().Be(code);
    }

    private static async Task<List<string>> ChildTitlesAsync(HttpClient admin, int parentId)
    {
        var tree = await admin.GetFromJsonAsync<List<NavigationArticleDto>>("/navigationTree/tree", ApiJson.Options);
        return Flatten(tree!).Single(node => node.Id == parentId).Children!.Select(node => node.Title).ToList();
    }

    private static IEnumerable<NavigationArticleDto> Flatten(IEnumerable<NavigationArticleDto> nodes) =>
        nodes.SelectMany(node => new[] { node }.Concat(Flatten(node.Children ?? [])));

    private static async Task<ArticleReadDto> CreateAsync(HttpClient admin, string title, int? parentId = null)
    {
        var response = await admin.PostAsJsonAsync("/articles/", new ArticleCreateDto { Title = title, ParentArticleId = parentId });
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleReadDto>(ApiJson.Options))!;
    }

    private async Task<HttpClient> CreateAdminClientAsync()
    {
        var client = _factory.CreateClient();
        var credentials = new { Email = "admin@mktba.test", Password = "Test-password-1" };

        var register = await client.PostAsJsonAsync("/auth/register", credentials);
        var auth = register.IsSuccessStatusCode
            ? await register.Content.ReadFromJsonAsync<AdminAuthResponseDto>(ApiJson.Options)
            : await (await client.PostAsJsonAsync("/auth/login", credentials)).Content.ReadFromJsonAsync<AdminAuthResponseDto>(ApiJson.Options);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.AccessToken);
        return client;
    }
}
