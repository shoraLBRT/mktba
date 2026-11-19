using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>P-01 (#89): <c>GET /authors/{slug}/articles</c> lists what a reader may open of an author's work.</summary>
public sealed class AuthorArticlesEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public AuthorArticlesEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenWrittenCoAuthoredDraftAndForeignArticles_WhenReaderListsTheAuthorsArticles_ThenOnlyTheirPublishedOnesAreListedNewestFirst()
    {
        var (author, authorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (other, otherId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var slug = await NameAsync(author);
        var written = await CreateArticleAsync(author, "Своя статья автора", summary: "Кратко о статье");
        await ApiJson.PublishAsync(admin, written.Id);
        var coAuthored = await CreateArticleAsync(other, "Статья в соавторстве");
        (await admin.PutAsJsonAsync(
            $"/articles/{coAuthored.Id}/authors", new ArticleAuthorsDto { AuthorId = otherId, CoAuthorIds = [authorId] }, ApiJson.Options))
            .StatusCode.Should().Be(HttpStatusCode.OK);
        await ApiJson.PublishAsync(admin, coAuthored.Id);
        var draft = await CreateArticleAsync(author, "Черновик автора");
        var foreign = await CreateArticleAsync(other, "Чужая статья");
        await ApiJson.PublishAsync(admin, foreign.Id);

        var response = await _factory.CreateClient().GetAsync($"/authors/{slug}/articles");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var list = (await response.Content.ReadFromJsonAsync<AuthorArticlesDto>(ApiJson.Options))!;
        list.Items.Select(article => article.Id).Should().Equal(coAuthored.Id, written.Id);
        list.Items.Select(article => article.Id).Should().NotContain([draft.Id, foreign.Id]);
        list.Total.Should().Be(2);
        list.Page.Should().Be(1);
        list.PageSize.Should().Be(20);
        var entry = list.Items[1];
        entry.Title.Should().Be(written.Title);
        entry.Slug.Should().Be(written.Slug);
        entry.Summary.Should().Be("Кратко о статье");
        entry.PublishedAt.Should().BeOnOrBefore(DateTime.UtcNow);
    }

    [Fact]
    public async Task GivenArticleUnderADraftParentAndAnotherLanguage_WhenListing_ThenTheyAreLeftOutOfTheRussianList()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var slug = await NameAsync(author);
        var visible = await CreateArticleAsync(author, "Видимая статья");
        await ApiJson.PublishAsync(admin, visible.Id);
        var hiddenParent = await CreateArticleAsync(admin, "Скрытый раздел");
        var underDraft = await CreateArticleAsync(author, "Статья под черновиком", parentId: hiddenParent.Id);
        await ApiJson.PublishAsync(admin, underDraft.Id);
        var english = await CreateArticleAsync(author, "English article", locale: "en");
        await ApiJson.PublishAsync(admin, english.Id);
        var anonymous = _factory.CreateClient();

        var russian = await anonymous.GetFromJsonAsync<AuthorArticlesDto>($"/authors/{slug}/articles", ApiJson.Options);
        var inEnglish = await anonymous.GetFromJsonAsync<AuthorArticlesDto>($"/authors/{slug}/articles?locale=en", ApiJson.Options);

        russian!.Items.Select(article => article.Id).Should().Equal(visible.Id);
        inEnglish!.Items.Select(article => article.Id).Should().Equal(english.Id);
    }

    [Fact]
    public async Task GivenThreeArticles_WhenReadingPagesOfTwo_ThenTheSecondPageHoldsTheOldestAndAPagePastTheEndIsEmpty()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var slug = await NameAsync(author);
        var ids = new List<int>();
        foreach (var title in new[] { "Первая по счёту", "Вторая по счёту", "Третья по счёту" })
        {
            var article = await CreateArticleAsync(author, title);
            await ApiJson.PublishAsync(admin, article.Id);
            ids.Add(article.Id);
        }

        var anonymous = _factory.CreateClient();

        var first = await anonymous.GetFromJsonAsync<AuthorArticlesDto>($"/authors/{slug}/articles?pageSize=2", ApiJson.Options);
        var second = await anonymous.GetFromJsonAsync<AuthorArticlesDto>($"/authors/{slug}/articles?pageSize=2&page=2", ApiJson.Options);
        var beyond = await anonymous.GetFromJsonAsync<AuthorArticlesDto>($"/authors/{slug}/articles?pageSize=500&page=9", ApiJson.Options);

        first!.Items.Select(article => article.Id).Should().Equal(ids[2], ids[1]);
        second!.Items.Select(article => article.Id).Should().Equal(ids[0]);
        second.Total.Should().Be(3);
        second.Page.Should().Be(2);
        beyond!.Items.Should().BeEmpty();
        beyond.PageSize.Should().Be(50, "the page size is capped");
        beyond.Total.Should().Be(3);
    }

    [Fact]
    public async Task GivenUnknownOrNonPublicAuthor_WhenListingArticles_ThenReturns404AuthorNotFound()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var slug = await NameAsync(author);
        await CreateArticleAsync(author, "Только черновик");
        var anonymous = _factory.CreateClient();

        var unknown = await anonymous.GetAsync("/authors/no-such-author/articles");
        var notPublic = await anonymous.GetAsync($"/authors/{slug}/articles");

        unknown.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await ApiJson.ReadCodeAsync(unknown)).Should().Be("author_not_found");
        notPublic.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await ApiJson.ReadCodeAsync(notPublic)).Should().Be("author_not_found");
    }

    [Fact]
    public async Task GivenUnsupportedLocale_WhenListingArticles_ThenReturns400WithLocaleUnsupportedCode()
    {
        var response = await _factory.CreateClient().GetAsync("/authors/anyone/articles?locale=fr");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("locale_unsupported");
    }

    private static async Task<string> NameAsync(HttpClient user)
    {
        var name = $"Автор {Guid.NewGuid().ToString("N")[..10]}";
        var response = await user.PutAsJsonAsync("/profile", new UserProfileWriteDto(name, null, null, null, null, null, null), ApiJson.Options);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<UserProfileDto>(ApiJson.Options))!.Slug!;
    }

    private static async Task<ArticleContentDto> CreateArticleAsync(
        HttpClient client, string title, string? summary = null, int? parentId = null, string? locale = null)
    {
        var dto = new ArticleContentCreateDto(
            $"{title} {Guid.NewGuid().ToString("N")[..8]}", parentId,
            [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
            null, summary, null, null, Locale: locale);
        var response = await client.PostAsJsonAsync("/articles/content", dto, ApiJson.Options);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
    }
}
