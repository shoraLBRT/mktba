using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>
/// M-08 (#116): a custom school is a scholar opinion — the scholar's name, years of life, a note and the
/// article about the scholar — kept in one directory and used by any article. Who may change or delete
/// an entry: an admin any; an editor of the article it was created for while no other article uses it.
/// </summary>
public abstract class ScholarOpinionEndpointTests
{
    private readonly MktbaApiFactory _factory;

    protected ScholarOpinionEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenScholarFields_WhenCreatingWithoutASlug_ThenTheyAreStoredAndThePublishedArticleIsLinked()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var aboutScholar = await CreateArticleAsync(admin, $"Ибн Таймия {Guid.NewGuid():N}");
        await ApiJson.PublishAsync(admin, aboutScholar.Id);
        var article = await CreateArticleAsync(admin, "Статья с мнением учёного");

        var school = await CreateSchoolAsync(admin, new SchoolCreateDto(
            null, "Ибн Таймия", "ИТ", article.Id, " Ибн Таймия ", "661–728 гг. х.", "Ханбалитский учёный.", aboutScholar.Id));

        school.Slug.Should().StartWith("scholar-");
        school.ScholarName.Should().Be("Ибн Таймия");
        school.ScholarYears.Should().Be("661–728 гг. х.");
        school.Description.Should().Be("Ханбалитский учёный.");
        school.ScholarArticleId.Should().Be(aboutScholar.Id);
        school.ScholarArticle.Should().BeEquivalentTo(
            new SchoolScholarArticleDto(aboutScholar.Id, aboutScholar.Slug, aboutScholar.Title, "ru"));

        var read = await ReadSchoolsAsync(_factory.CreateClient(), article.Id, admin);
        read.Should().ContainSingle().Which.ScholarArticle!.Id.Should().Be(aboutScholar.Id);
    }

    [Fact]
    public async Task GivenTheArticleAboutTheScholarIsADraft_WhenReadingTheSchool_ThenReadersGetNoLink()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var draftAbout = await CreateArticleAsync(admin, "Черновик об учёном");
        var article = await CreateArticleAsync(admin, "Статья со ссылкой на черновик");

        var school = await CreateSchoolAsync(admin, new SchoolCreateDto(
            null, "Учёный", "Уч", article.Id, "Учёный", null, null, draftAbout.Id));

        school.ScholarArticleId.Should().Be(draftAbout.Id);
        school.ScholarArticle.Should().BeNull();
    }

    [Fact]
    public async Task GivenAnEntryOfAnotherArticle_WhenAnArticleLinksItsOpinionToIt_ThenItIsAmongThatArticlesSchools()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var first = await CreateArticleAsync(admin, "Первая статья");
        var school = await CreateSchoolAsync(admin, new SchoolCreateDto(null, "Аль-Албани", "Алб", first.Id, "Аль-Албани"));

        var second = await CreateArticleAsync(admin, "Вторая статья", school.Id);

        (await ReadSchoolsAsync(admin, second.Id)).Select(s => s.Id).Should().Equal(school.Id);
        (await ReadSchoolsAsync(admin, first.Id)).Select(s => s.Id).Should().Equal(school.Id);

        var directory = await admin.GetFromJsonAsync<List<SchoolDto>>("/schools/custom", ApiJson.Options);
        directory!.Should().Contain(s => s.Id == school.Id).And.OnlyContain(s => !s.IsSystem);
    }

    [Fact]
    public async Task GivenAnEntryAnotherArticleUses_WhenItsAuthorChangesOrDeletesIt_ThenOnlyAnAdminMay()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var own = await CreateArticleAsync(author, "Статья автора");
        var school = await CreateSchoolAsync(author, new SchoolCreateDto(null, "Учёный автора", "УА", own.Id, "Учёный"));

        var renamed = await author.PutAsJsonAsync($"/schools/{school.Id}", new SchoolUpdateDto("Учёный автора (правка)", "УА", "Учёный", "ум. 300 г. х."));
        renamed.StatusCode.Should().Be(HttpStatusCode.OK);
        (await renamed.Content.ReadFromJsonAsync<SchoolDto>(ApiJson.Options))!.ScholarYears.Should().Be("ум. 300 г. х.");

        await CreateArticleAsync(admin, "Чужая статья, которая его использует", school.Id);

        var update = await author.PutAsJsonAsync($"/schools/{school.Id}", new SchoolUpdateDto("Ещё правка", "УА"));
        update.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ApiJson.ReadCodeAsync(update)).Should().Be("school_in_use");
        var delete = await author.DeleteAsync($"/schools/{school.Id}");
        delete.StatusCode.Should().Be(HttpStatusCode.Conflict);

        (await admin.PutAsJsonAsync($"/schools/{school.Id}", new SchoolUpdateDto("Правка админа", "ПА")))
            .StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GivenADirectoryEntryOrSomeoneElsesDraft_WhenAnAuthorChangesIt_ThenRefused()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (stranger, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var directoryEntry = await CreateSchoolAsync(author, new SchoolCreateDto(null, "Без статьи", "БС", null, "Учёный"));
        directoryEntry.ArticleScopeId.Should().BeNull();
        var own = await CreateArticleAsync(author, "Черновик автора");
        var scoped = await CreateSchoolAsync(author, new SchoolCreateDto(null, "Своя", "Св", own.Id));

        (await author.PutAsJsonAsync($"/schools/{directoryEntry.Id}", new SchoolUpdateDto("Правка", "П")))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await stranger.PutAsJsonAsync($"/schools/{scoped.Id}", new SchoolUpdateDto("Правка", "П")))
            .StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await _factory.CreateClient().GetAsync("/schools/custom")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GivenBadFields_WhenCreatingOrChanging_ThenAnswers400WithTheCode()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);

        var tooLong = await admin.PostAsJsonAsync("/schools", new SchoolCreateDto(null, "Имя", "И", null, new string('я', School.ScholarNameMaxLength + 1)));
        tooLong.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(tooLong)).Should().Be("school_field_too_long");

        var noArticle = await admin.PostAsJsonAsync("/schools", new SchoolCreateDto(null, "Имя", "И", null, ScholarArticleId: int.MaxValue));
        (await ApiJson.ReadCodeAsync(noArticle)).Should().Be("school_scholar_article_not_found");

        var system = (await admin.GetFromJsonAsync<List<SchoolDto>>("/schools/system", ApiJson.Options))![0];
        var changeSystem = await admin.PutAsJsonAsync($"/schools/{system.Id}", new SchoolUpdateDto("Имя", "И"));
        (await ApiJson.ReadCodeAsync(changeSystem)).Should().Be("system_school_update_forbidden");
    }

    private static async Task<SchoolDto> CreateSchoolAsync(HttpClient client, SchoolCreateDto dto)
    {
        var response = await client.PostAsJsonAsync("/schools", dto);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<SchoolDto>(ApiJson.Options))!;
    }

    private static async Task<List<SchoolDto>> ReadSchoolsAsync(HttpClient client, int articleId, HttpClient? publisher = null)
    {
        if (publisher is not null)
            await ApiJson.PublishAsync(publisher, articleId);
        var response = await client.GetAsync($"/schools/article/{articleId}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<List<SchoolDto>>(ApiJson.Options))!;
    }

    /// <summary>An article; with <paramref name="schoolId"/>, a block of two opinions, the second linked to that school.</summary>
    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient client, string title, int? schoolId = null)
    {
        var opinions = schoolId is int id
            ? new List<OpinionCreateDto> { new("Общее", true, []), new("Мнение учёного", false, [id]) }
            : [new OpinionCreateDto("Текст", true, [])];
        var dto = new ArticleContentCreateDto(
            title, null, [new ParagraphCreateDto { Order = 1, Opinions = opinions }], null, null, null, null, null);
        var response = await client.PostAsJsonAsync("/articles/content", dto);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
    }

    /// <summary>On the InMemory provider.</summary>
    public sealed class InMemory(MktbaApiFactory factory) : ScholarOpinionEndpointTests(factory), IClassFixture<MktbaApiFactory>;

    /// <summary>On a real PostgreSQL database (X-07, #161).</summary>
    public sealed class OnPostgres(PostgresApiFactory factory) : ScholarOpinionEndpointTests(factory), IClassFixture<PostgresApiFactory>;
}
