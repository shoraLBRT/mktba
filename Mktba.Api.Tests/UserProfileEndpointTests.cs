using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>
/// U-07 (#72): user profiles over HTTP — a user's own, an admin's access to anyone's, and the
/// public part by slug. Who may call what is covered by <see cref="EndpointAuthorizationMatrixTests"/>.
/// </summary>
public sealed class UserProfileEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public UserProfileEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenNewUser_WhenReadingOwnProfile_ThenEverythingIsEmptyAndNotPublic()
    {
        var (reader, readerId) = await RoleClients.CreateAsync(_factory, UserRole.Reader);

        var profile = await reader.GetFromJsonAsync<UserProfileDto>("/profile", ApiJson.Options);

        profile.Should().BeEquivalentTo(new UserProfileDto(readerId, UserRole.Reader, null, null, null, null, null, null, [], false));
    }

    [Fact]
    public async Task GivenFullProfile_WhenSaving_ThenItIsStoredAndTheSlugComesFromTheName()
    {
        var (author, authorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var tag = Tag();
        var written = new UserProfileWriteDto(
            $"  Иван Иванов {tag} ", null, "https://example.com/a.png", "О себе\r\nвторая строка", "Кандидат наук", "Аль-Азхар",
            [new ProfileLinkDto("Сайт", "https://example.com/me"), new ProfileLinkDto("Телеграм", "https://t.me/someone")]);

        var saved = await PutAsync(author, "/profile", written);
        var read = await author.GetFromJsonAsync<UserProfileDto>("/profile", ApiJson.Options);

        saved.Should().BeEquivalentTo(new UserProfileDto(
            authorId, UserRole.Author, $"Иван Иванов {tag}", $"ivan-ivanov-{tag}", "https://example.com/a.png", "О себе\nвторая строка",
            "Кандидат наук", "Аль-Азхар",
            [new ProfileLinkDto("Сайт", "https://example.com/me"), new ProfileLinkDto("Телеграм", "https://t.me/someone")], false),
            options => options.WithStrictOrdering());
        read.Should().BeEquivalentTo(saved, options => options.WithStrictOrdering());
    }

    [Fact]
    public async Task GivenTwoUsersWithTheSameName_WhenBothSaveWithoutSlug_ThenTheSecondGetsASuffix()
    {
        var (first, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (second, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var name = $"Тёзка {Tag()}";

        var firstSaved = await PutAsync(first, "/profile", Named(name));
        var secondSaved = await PutAsync(second, "/profile", Named(name));

        secondSaved.Slug.Should().Be($"{firstSaved.Slug}-2");
    }

    [Fact]
    public async Task GivenSlugOfAnotherUser_WhenSavingItByHand_ThenReturns400ProfileSlugTaken()
    {
        var (first, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (second, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var taken = (await PutAsync(first, "/profile", Named($"Первый {Tag()}"))).Slug;

        var response = await second.PutAsJsonAsync("/profile", Named("Второй", taken), ApiJson.Options);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("profile_slug_taken");
    }

    [Fact]
    public async Task GivenProfileWithSlug_WhenRenamingWithBlankSlug_ThenTheSlugStays()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var original = await PutAsync(author, "/profile", Named($"Старое имя {Tag()}"));

        var renamed = await PutAsync(author, "/profile", Named("Новое имя"));

        renamed.DisplayName.Should().Be("Новое имя");
        renamed.Slug.Should().Be(original.Slug);
    }

    [Fact]
    public async Task GivenProfileWithName_WhenClearingTheName_ThenTheSlugIsClearedToo()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        await PutAsync(author, "/profile", Named($"Временное имя {Tag()}"));

        var cleared = await PutAsync(author, "/profile", new UserProfileWriteDto(null, null, null, "Только описание", null, null, null));

        cleared.DisplayName.Should().BeNull();
        cleared.Slug.Should().BeNull();
        cleared.Bio.Should().Be("Только описание");
    }

    [Theory]
    [InlineData("""{"displayName":"Имя","slug":"Не slug"}""", "profile_slug_invalid")]
    [InlineData("""{"slug":"someone"}""", "profile_display_name_required")]
    [InlineData("""{"displayName":"Имя","avatarUrl":"javascript:alert(1)"}""", "profile_avatar_url_invalid")]
    [InlineData("""{"displayName":"Имя","links":[{"label":"Сайт","url":"javascript:alert(1)"}]}""", "profile_link_url_invalid")]
    [InlineData("""{"displayName":"Имя","links":[{"label":"","url":"https://example.com"}]}""", "profile_link_label_invalid")]
    public async Task GivenInvalidProfile_WhenSaving_ThenReturns400WithItsCode(string json, string expectedCode)
    {
        var (reader, _) = await RoleClients.CreateAsync(_factory, UserRole.Reader);

        var response = await reader.PutAsync("/profile", new StringContent(json, System.Text.Encoding.UTF8, "application/json"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(response)).Should().Be(expectedCode);
    }

    [Fact]
    public async Task GivenNamedUserWithoutPublishedArticle_WhenReaderOpensTheirPage_ThenReturns404AuthorNotFound()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var profile = await PutAsync(author, "/profile", Named($"Без статей {Tag()}"));
        await CreateArticleAsync(author, "Черновик автора без публикаций");

        var response = await _factory.CreateClient().GetAsync($"/authors/{profile.Slug}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("author_not_found");
        profile.IsPublic.Should().BeFalse();
    }

    [Fact]
    public async Task GivenAuthorOfPublishedArticle_WhenReaderOpensTheirPage_ThenGetsOnlyPublicFields()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var tag = Tag();
        await PutAsync(author, "/profile", new UserProfileWriteDto(
            $"Автор {tag}", null, "/media/a.png", "О себе", "Самозаявленная степень", "Самозаявленный вуз",
            [new ProfileLinkDto("Сайт", "https://example.com/me")]));
        var articleId = await CreateArticleAsync(author, $"Опубликованная статья {tag}");
        await ApiJson.PublishAsync(admin, articleId);

        var response = await _factory.CreateClient().GetAsync($"/authors/avtor-{tag}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.EnumerateObject().Select(property => property.Name).Should().BeEquivalentTo(
            "slug", "displayName", "role", "avatarUrl", "bio", "degree", "institution", "links");
        body.GetProperty("displayName").GetString().Should().Be($"Автор {tag}");
        body.GetProperty("role").GetString().Should().Be("Author");
        body.GetProperty("avatarUrl").GetString().Should().Be("/media/a.png");
        body.GetProperty("degree").ValueKind.Should().Be(JsonValueKind.Null, "the degree is shown only for scholars");
        body.GetProperty("institution").ValueKind.Should().Be(JsonValueKind.Null);
        body.GetProperty("links")[0].GetProperty("url").GetString().Should().Be("https://example.com/me");
        body.GetRawText().Should().NotContain("@mktba.test", "the email never leaves the admin area");
        (await author.GetFromJsonAsync<UserProfileDto>("/profile", ApiJson.Options))!.IsPublic.Should().BeTrue();
    }

    [Fact]
    public async Task GivenScholarCreditedAsCoAuthor_WhenReaderOpensTheirPage_ThenDegreeAndInstitutionAreGiven()
    {
        var (author, authorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (scholar, scholarId) = await RoleClients.CreateAsync(_factory, UserRole.Scholar);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var tag = Tag();
        await PutAsync(scholar, "/profile", new UserProfileWriteDto($"Учёный {tag}", null, null, null, "Доктор шариатских наук", "Аль-Азхар", null));
        var articleId = await CreateArticleAsync(author, $"Статья с соавтором {tag}");
        var authorship = await admin.PutAsJsonAsync(
            $"/articles/{articleId}/authors", new ArticleAuthorsDto { AuthorId = authorId, CoAuthorIds = [scholarId] }, ApiJson.Options);
        authorship.StatusCode.Should().Be(HttpStatusCode.OK);
        await ApiJson.PublishAsync(admin, articleId);

        var profile = await _factory.CreateClient().GetFromJsonAsync<PublicProfileDto>($"/authors/uchyonyy-{tag}", ApiJson.Options);

        profile!.Role.Should().Be(UserRole.Scholar);
        profile.Degree.Should().Be("Доктор шариатских наук");
        profile.Institution.Should().Be("Аль-Азхар");
    }

    [Fact]
    public async Task GivenPublicProfile_WhenTheSlugChanges_ThenTheOldAddressAnswers404()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var tag = Tag();
        var original = await PutAsync(author, "/profile", Named($"Переезд {tag}"));
        await ApiJson.PublishAsync(admin, await CreateArticleAsync(author, $"Статья переезда {tag}"));
        var anonymous = _factory.CreateClient();

        await PutAsync(author, "/profile", Named($"Переезд {tag}", $"new-home-{tag}"));

        (await anonymous.GetAsync($"/authors/{original.Slug}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await anonymous.GetAsync($"/authors/new-home-{tag}")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GivenAdmin_WhenEditingAnotherUsersProfile_ThenItChangesAndTheUsersListShowsTheName()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (reader, readerId) = await RoleClients.CreateAsync(_factory, UserRole.Reader);
        var name = $"Названный админом {Tag()}";

        var saved = await PutAsync(admin, $"/users/{readerId}/profile", Named(name));

        saved.UserId.Should().Be(readerId);
        (await admin.GetFromJsonAsync<UserProfileDto>($"/users/{readerId}/profile", ApiJson.Options))!.DisplayName.Should().Be(name);
        (await reader.GetFromJsonAsync<UserProfileDto>("/profile", ApiJson.Options))!.DisplayName.Should().Be(name);
        var users = await admin.GetFromJsonAsync<List<UserSummaryDto>>("/users", ApiJson.Options);
        users!.Single(user => user.Id == readerId).DisplayName.Should().Be(name);
    }

    [Fact]
    public async Task GivenUnknownUser_WhenAdminReadsOrWritesTheirProfile_ThenReturns404UserNotFound()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);

        var read = await admin.GetAsync("/users/999999/profile");
        var write = await admin.PutAsJsonAsync("/users/999999/profile", Named("Никто"), ApiJson.Options);

        read.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await ApiJson.ReadCodeAsync(write)).Should().Be("user_not_found");
    }

    private static string Tag() => Guid.NewGuid().ToString("N")[..10];

    private static UserProfileWriteDto Named(string displayName, string? slug = null)
        => new(displayName, slug, null, null, null, null, null);

    private static async Task<UserProfileDto> PutAsync(HttpClient client, string url, UserProfileWriteDto profile)
    {
        var response = await client.PutAsJsonAsync(url, profile, ApiJson.Options);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<UserProfileDto>(ApiJson.Options))!;
    }

    private static async Task<int> CreateArticleAsync(HttpClient author, string title)
    {
        var response = await author.PostAsJsonAsync("/articles", new ArticleCreateDto { Title = title }, ApiJson.Options);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleReadDto>(ApiJson.Options))!.Id;
    }
}
