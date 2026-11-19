using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>
/// M-07 (#71): the directory of sources over HTTP and the citations a reader gets with an article.
/// Who may call what is covered by <see cref="EndpointAuthorizationMatrixTests"/>.
/// </summary>
public sealed class SourceEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public SourceEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenAuthor_WhenAddingSourceAndCitingItInOwnArticle_ThenAnonymousReaderOfPublishedArticleGetsIt()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var source = await CreateSourceAsync(author, new SourceWriteDto(SourceKind.HadithCollection, "Сахих (чтение)", "аль-Бухари", null, "https://example.com/sahih"));
        var article = await CreateArticleAsync(author, "Статья с источником", new OpinionSourceDto(source.Id, "№ 1"));
        await ApiJson.PublishAsync(admin, article.Id);

        var content = await _factory.CreateClient().GetFromJsonAsync<JsonElement>($"/articles/by-slug/{article.Slug}/content");

        var citation = content.GetProperty("paragraphs")[0].GetProperty("opinions")[0].GetProperty("sources")[0];
        citation.GetProperty("sourceId").GetInt32().Should().Be(source.Id);
        citation.GetProperty("locator").GetString().Should().Be("№ 1");
        var listed = content.GetProperty("sources").EnumerateArray().Should().ContainSingle().Subject;
        listed.GetProperty("kind").GetString().Should().Be("HadithCollection");
        listed.GetProperty("title").GetString().Should().Be("Сахих (чтение)");
        listed.GetProperty("author").GetString().Should().Be("аль-Бухари");
        listed.GetProperty("url").GetString().Should().Be("https://example.com/sahih");
    }

    [Fact]
    public async Task GivenDirectory_WhenAuthorSearchesIt_ThenMatchingEntriesAreListed()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var wanted = await CreateSourceAsync(author, new SourceWriteDto(SourceKind.Book, "Рисаля (список)", "аш-Шафии", null, null));
        await CreateSourceAsync(author, new SourceWriteDto(SourceKind.Book, "Муватта (список)", "Малик", null, null));

        var found = await author.GetFromJsonAsync<List<SourceDto>>("/sources?q=рисаля&kind=Book&limit=5", ApiJson.Options);

        found.Should().Equal(wanted);
    }

    [Fact]
    public async Task GivenUnknownSourceId_WhenSavingArticle_ThenReturns400SourceNotFound()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);

        var response = await author.PostAsJsonAsync("/articles/content", NewArticle("Нет такого источника", new OpinionSourceDto(424242, null)), ApiJson.Options);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("source_not_found");
    }

    [Fact]
    public async Task GivenSource_WhenAdminEditsAndDeletesIt_ThenDirectoryFollows()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var source = await CreateSourceAsync(admin, new SourceWriteDto(SourceKind.Book, "Опечатка (правка)", null, null, null));

        var update = await admin.PutAsJsonAsync($"/sources/{source.Id}", new SourceWriteDto(SourceKind.Book, "Без опечатки (правка)", "Автор", null, null), ApiJson.Options);
        var updated = await update.Content.ReadFromJsonAsync<SourceDto>(ApiJson.Options);
        var delete = await admin.DeleteAsync($"/sources/{source.Id}");
        var deleteAgain = await admin.DeleteAsync($"/sources/{source.Id}");

        update.StatusCode.Should().Be(HttpStatusCode.OK);
        updated.Should().Be(new SourceDto(source.Id, SourceKind.Book, "Без опечатки (правка)", "Автор", null, null));
        delete.StatusCode.Should().Be(HttpStatusCode.NoContent);
        deleteAgain.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await ApiJson.ReadCodeAsync(deleteAgain)).Should().Be("source_not_found");
    }

    [Fact]
    public async Task GivenParagraphEndpoint_WhenAdminSendsCitations_ThenTheyAreStoredAndReturned()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var source = await CreateSourceAsync(admin, new SourceWriteDto(SourceKind.Quran, "Коран (параграф)", null, null, null));
        var article = await CreateArticleAsync(admin, "Статья для параграфа");

        var response = await admin.PostAsJsonAsync("/paragraph", new ParagraphCreateDto
        {
            ArticleId = article.Id,
            Order = 2,
            Opinions = { new OpinionCreateDto("Аят", true, [], [new OpinionSourceDto(source.Id, "2:255")]) },
        }, ApiJson.Options);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var content = await admin.GetFromJsonAsync<ArticleContentDto>($"/articles/{article.Id}/content", ApiJson.Options);
        content!.Paragraphs[1].Opinions[0].Sources.Should().Equal(new OpinionSourceDto(source.Id, "2:255"));
        content.Sources.Should().Equal(source);
    }

    private static ArticleContentCreateDto NewArticle(string title, params OpinionSourceDto[] sources) =>
        new(title, null, [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [], sources.ToList())] }], null, null, null, null);

    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient client, string title, params OpinionSourceDto[] sources)
    {
        var response = await client.PostAsJsonAsync("/articles/content", NewArticle(title, sources), ApiJson.Options);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
    }

    private static async Task<SourceDto> CreateSourceAsync(HttpClient client, SourceWriteDto dto)
    {
        var response = await client.PostAsJsonAsync("/sources", dto, ApiJson.Options);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<SourceDto>(ApiJson.Options))!;
    }
}
