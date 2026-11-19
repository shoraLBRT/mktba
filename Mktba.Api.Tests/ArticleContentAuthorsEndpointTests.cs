using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>P-06 (#94): the content reads name the article's authors for the reader.</summary>
public sealed class ArticleContentAuthorsEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public ArticleContentAuthorsEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenPublishedArticleWithNamedAuthorAndCoAuthors_WhenReaderReadsItBySlugAndById_ThenAuthorComesFirstWithLinkableSlugs()
    {
        var (first, firstId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (second, secondId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (third, thirdId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var firstProfile = await NameAsync(first);
        var secondProfile = await NameAsync(second);
        var thirdProfile = await NameAsync(third);
        var article = await CreateArticleAsync(third);
        await SetAuthorsAsync(admin, article.Id, thirdId, [secondId, firstId]);
        await ApiJson.PublishAsync(admin, article.Id);
        var anonymous = _factory.CreateClient();

        var bySlug = await anonymous.GetFromJsonAsync<ArticleContentDto>($"/articles/by-slug/{article.Slug}/content", ApiJson.Options);
        var byId = await anonymous.GetFromJsonAsync<ArticleContentDto>($"/articles/{article.Id}/content", ApiJson.Options);

        var expected = new[]
        {
            new ArticleAuthorDto(thirdProfile.DisplayName!, thirdProfile.Slug),
            new ArticleAuthorDto(firstProfile.DisplayName!, firstProfile.Slug),
            new ArticleAuthorDto(secondProfile.DisplayName!, secondProfile.Slug)
        };
        bySlug!.Authors.Should().Equal(expected);
        byId!.Authors.Should().Equal(expected);
        foreach (var author in bySlug.Authors!)
        {
            (await anonymous.GetAsync($"/authors/{author.Slug}")).StatusCode.Should().Be(HttpStatusCode.OK);
        }
    }

    [Fact]
    public async Task GivenAuthorWithoutDisplayName_WhenReaderReadsTheArticle_ThenOnlyTheNamedCoAuthorIsListedAndNoEmailLeaks()
    {
        var (unnamed, unnamedId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (named, namedId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var profile = await NameAsync(named);
        var article = await CreateArticleAsync(unnamed);
        await SetAuthorsAsync(admin, article.Id, unnamedId, [namedId]);
        await ApiJson.PublishAsync(admin, article.Id);

        var response = await _factory.CreateClient().GetAsync($"/articles/{article.Id}/content");

        var json = await response.Content.ReadAsStringAsync();
        json.Should().NotContain("@", "no email reaches a reader");
        var content = System.Text.Json.JsonSerializer.Deserialize<ArticleContentDto>(json, ApiJson.Options)!;
        content.Authors.Should().Equal(new ArticleAuthorDto(profile.DisplayName!, profile.Slug));
    }

    [Fact]
    public async Task GivenNobodyHasADisplayName_WhenReaderReadsTheArticle_ThenAuthorsIsEmpty()
    {
        var (unnamed, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var article = await CreateArticleAsync(unnamed);
        await ApiJson.PublishAsync(admin, article.Id);

        var content = await _factory.CreateClient().GetFromJsonAsync<ArticleContentDto>($"/articles/{article.Id}/content", ApiJson.Options);

        content!.Authors.Should().BeEmpty();
    }

    [Fact]
    public async Task GivenDraftByAnAuthorWithNothingPublished_WhenAdminPreviewsIt_ThenTheAuthorIsNamedWithoutASlugUntilPublication()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var profile = await NameAsync(author);
        var draft = await CreateArticleAsync(author);

        var preview = await admin.GetFromJsonAsync<ArticleContentDto>($"/articles/{draft.Id}/content", ApiJson.Options);
        var pageBefore = await _factory.CreateClient().GetAsync($"/authors/{profile.Slug}");
        await ApiJson.PublishAsync(admin, draft.Id);
        var published = await admin.GetFromJsonAsync<ArticleContentDto>($"/articles/{draft.Id}/content", ApiJson.Options);

        preview!.Authors.Should().Equal(new ArticleAuthorDto(profile.DisplayName!, null));
        pageBefore.StatusCode.Should().Be(HttpStatusCode.NotFound);
        published!.Authors.Should().Equal(new ArticleAuthorDto(profile.DisplayName!, profile.Slug));
    }

    [Fact]
    public async Task GivenDraftByAnAuthorPublishedElsewhere_WhenAdminPreviewsIt_ThenTheSlugIsGiven()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var profile = await NameAsync(author);
        var other = await CreateArticleAsync(author);
        await ApiJson.PublishAsync(admin, other.Id);
        var draft = await CreateArticleAsync(author);

        var preview = await admin.GetFromJsonAsync<ArticleContentDto>($"/articles/{draft.Id}/content", ApiJson.Options);

        preview!.Authors.Should().Equal(new ArticleAuthorDto(profile.DisplayName!, profile.Slug));
    }

    private static async Task<UserProfileDto> NameAsync(HttpClient user)
    {
        var name = $"Автор {Guid.NewGuid().ToString("N")[..10]}";
        var response = await user.PutAsJsonAsync("/profile", new UserProfileWriteDto(name, null, null, null, null, null, null), ApiJson.Options);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<UserProfileDto>(ApiJson.Options))!;
    }

    private static async Task SetAuthorsAsync(HttpClient admin, int articleId, int authorId, List<int> coAuthorIds)
        => (await admin.PutAsJsonAsync(
                $"/articles/{articleId}/authors", new ArticleAuthorsDto { AuthorId = authorId, CoAuthorIds = coAuthorIds }, ApiJson.Options))
            .StatusCode.Should().Be(HttpStatusCode.OK);

    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient client)
    {
        var dto = new ArticleContentCreateDto(
            $"Статья с автором {Guid.NewGuid().ToString("N")[..8]}", null,
            [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
            null, null, null, null);
        var response = await client.PostAsJsonAsync("/articles/content", dto, ApiJson.Options);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
    }
}
