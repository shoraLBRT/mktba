using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>A-02 (#34): the admin article list and its bulk status action over HTTP.</summary>
public sealed class ArticleListEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public ArticleListEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    private static async Task<ArticleReadDto> CreateAsync(HttpClient client, string title)
    {
        var response = await client.PostAsJsonAsync("/articles", new ArticleCreateDto { Title = title });
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleReadDto>(ApiJson.Options))!;
    }

    private static async Task<ArticleListPageDto> ListAsync(HttpClient client, string query) =>
        (await client.GetFromJsonAsync<ArticleListPageDto>($"/articles/admin-list?{query}", ApiJson.Options))!;

    [Fact]
    public async Task GivenArticles_WhenListingWithSearchSortAndPaging_ThenReturnsTheRequestedPage()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var marker = Guid.NewGuid().ToString("N")[..8];
        foreach (var letter in new[] { "в", "а", "б" })
        {
            await CreateAsync(admin, $"{marker} {letter}");
        }

        var page = await ListAsync(admin, $"search={marker}&sort=Title&dir=Asc&page=2&pageSize=2");

        page.Total.Should().Be(3);
        page.Page.Should().Be(2);
        page.PageSize.Should().Be(2);
        page.Items.Should().ContainSingle().Which.Title.Should().Be($"{marker} в");
    }

    [Fact]
    public async Task GivenAnUnknownSortValue_WhenListing_ThenReturns400()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);

        var response = await admin.GetAsync("/articles/admin-list?sort=popularity");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GivenAnAuthor_WhenListing_ThenSomeoneElsesDraftIsLeftOut()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (author, authorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var marker = Guid.NewGuid().ToString("N")[..8];
        var own = await CreateAsync(author, $"{marker} свой");
        await CreateAsync(admin, $"{marker} чужой черновик");

        var page = await ListAsync(author, $"search={marker}&status=Draft");

        page.Items.Should().ContainSingle().Which.Id.Should().Be(own.Id);
        page.Items[0].AuthorId.Should().Be(authorId);
        page.Items[0].AllowedTransitions.Should().Equal(ArticleStatus.InReview);
    }

    [Fact]
    public async Task GivenOwnCoAuthoredAndOthersArticles_WhenListingMine_ThenOnlyOwnAndCoAuthoredAreListedWithTheLastMove()
    {
        var (admin, adminId) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (author, authorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var marker = Guid.NewGuid().ToString("N")[..8];
        var own = await CreateAsync(author, $"{marker} свой");
        var coAuthored = await CreateAsync(admin, $"{marker} соавторство");
        (await admin.PutAsJsonAsync($"/articles/{coAuthored.Id}/authors", new ArticleAuthorsDto { AuthorId = adminId, CoAuthorIds = [authorId] }))
            .EnsureSuccessStatusCode();
        var othersPublished = await CreateAsync(admin, $"{marker} чужая опубликованная");
        await ApiJson.PublishAsync(admin, othersPublished.Id);
        (await author.PostAsJsonAsync($"/articles/{own.Id}/status", new { status = "InReview" })).EnsureSuccessStatusCode();
        (await admin.PostAsJsonAsync($"/articles/{own.Id}/status", new { status = "Draft", comment = "Добавьте источники." }))
            .EnsureSuccessStatusCode();

        var mine = await ListAsync(author, $"search={marker}&mine=true&sort=Title&dir=Asc");
        var all = await ListAsync(author, $"search={marker}");

        mine.Items.Select(item => item.Id).Should().BeEquivalentTo([own.Id, coAuthored.Id]);
        var returned = mine.Items.Single(item => item.Id == own.Id);
        returned.LastStatusChange!.ToStatus.Should().Be(ArticleStatus.Draft);
        returned.LastStatusChange.Comment.Should().Be("Добавьте источники.");
        mine.Items.Single(item => item.Id == coAuthored.Id).LastStatusChange.Should().BeNull();
        all.Items.Single(item => item.Id == othersPublished.Id).LastStatusChange.Should().BeNull("only editors of an article read its moves");
    }

    [Fact]
    public async Task GivenAMixOfArticles_WhenAnAuthorSubmitsThemInBulk_ThenEachIsReportedOnItsOwn()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var own = await CreateAsync(author, "Свой для массовой отправки");
        var othersDraft = await CreateAsync(admin, "Чужой черновик для массовой отправки");
        var published = await CreateAsync(admin, "Опубликованная для массовой отправки");
        await ApiJson.PublishAsync(admin, published.Id);

        var response = await author.PostAsJsonAsync(
            "/articles/bulk/status",
            new ArticleBulkStatusDto { Ids = [own.Id, othersDraft.Id, published.Id, own.Id, int.MaxValue], Status = ArticleStatus.InReview },
            ApiJson.Options);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var results = (await response.Content.ReadFromJsonAsync<ArticleBulkResultDto>(ApiJson.Options))!.Results;
        results.Select(result => (result.Id, result.Ok, result.Code)).Should().Equal(
            (own.Id, true, (string?)null),
            (othersDraft.Id, false, "article_not_found"),
            (published.Id, false, "forbidden"),
            (int.MaxValue, false, "article_not_found"));
        var reread = await admin.GetFromJsonAsync<ArticleReadDto>($"/articles/{own.Id}", ApiJson.Options);
        reread!.Status.Should().Be(ArticleStatus.InReview);
    }

    [Fact]
    public async Task GivenAnAdmin_WhenAMoveIsNotAllowedForSomeArticles_ThenOnlyThoseReportTheTransitionCode()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var inReview = await CreateAsync(admin, "На ревью для массовой публикации");
        var draft = await CreateAsync(admin, "Черновик для массовой публикации");
        (await admin.PostAsJsonAsync($"/articles/{inReview.Id}/status", new { status = "InReview" })).EnsureSuccessStatusCode();

        var response = await admin.PostAsJsonAsync(
            "/articles/bulk/status",
            new ArticleBulkStatusDto { Ids = [inReview.Id, draft.Id], Status = ArticleStatus.Published },
            ApiJson.Options);

        var results = (await response.Content.ReadFromJsonAsync<ArticleBulkResultDto>(ApiJson.Options))!.Results;
        results.Select(result => (result.Ok, result.Code)).Should().Equal(
            (true, (string?)null),
            (false, "article_status_transition_invalid"));
    }

    [Fact]
    public async Task GivenMoreThanTheLimit_WhenChangingStatusInBulk_ThenReturns400AndChangesNothing()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var draft = await CreateAsync(admin, "Черновик сверх лимита");

        var response = await admin.PostAsJsonAsync(
            "/articles/bulk/status",
            new ArticleBulkStatusDto { Ids = [draft.Id, .. Enumerable.Range(1_000_000, 100)], Status = ArticleStatus.InReview },
            ApiJson.Options);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("article_bulk_too_many");
        var reread = await admin.GetFromJsonAsync<ArticleReadDto>($"/articles/{draft.Id}", ApiJson.Options);
        reread!.Status.Should().Be(ArticleStatus.Draft);
    }
}
