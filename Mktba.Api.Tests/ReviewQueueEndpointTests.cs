using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>A-04 (#87): the moderation queue, approving, and returning an article with a comment its author reads.</summary>
public sealed class ReviewQueueEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public ReviewQueueEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenAnAuthorSubmitsADraft_WhenAReviewerReadsTheQueue_ThenItIsListedWithItsAuthorAndRevisions()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        await SetDisplayNameAsync(author, "Автор очереди");
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var article = await CreateArticleAsync(author, "На проверку");
        var other = await CreateArticleAsync(author, "Остаётся черновиком");

        await MoveAsync(author, article.Id, "InReview");
        var queue = await admin.GetFromJsonAsync<List<ReviewQueueItemDto>>("/articles/review-queue", ApiJson.Options);

        var item = queue!.Single(entry => entry.Id == article.Id);
        item.Title.Should().Be("На проверку");
        item.AuthorDisplayName.Should().Be("Автор очереди");
        item.SubmittedAt.Should().NotBeNull();
        item.LatestRevisionNumber.Should().Be(1);
        item.PublishedRevisionNumber.Should().BeNull();
        queue.Should().NotContain(entry => entry.Id == other.Id);
    }

    [Fact]
    public async Task GivenAPublishedArticleBackInReview_WhenReadingTheQueue_ThenItGivesThePublishedRevision()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var article = await CreateArticleAsync(admin, "Была опубликована");
        await ApiJson.PublishAsync(admin, article.Id);
        await MoveAsync(admin, article.Id, "Archived");
        await MoveAsync(admin, article.Id, "Draft");
        await SaveAgainAsync(admin, article);
        await MoveAsync(admin, article.Id, "InReview");

        var queue = await admin.GetFromJsonAsync<List<ReviewQueueItemDto>>("/articles/review-queue?locale=ru", ApiJson.Options);

        var item = queue!.Single(entry => entry.Id == article.Id);
        item.PublishedRevisionNumber.Should().Be(1);
        item.LatestRevisionNumber.Should().Be(2);
    }

    [Fact]
    public async Task GivenAnAuthor_WhenReadingTheQueue_ThenReturnsForbidden()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);

        (await author.GetAsync("/articles/review-queue")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task GivenAnUnsupportedLocale_WhenReadingTheQueue_ThenReturns400()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);

        var response = await admin.GetAsync("/articles/review-queue?locale=xx");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("locale_unsupported");
    }

    [Fact]
    public async Task GivenAReviewerReturnsAnArticleWithAComment_WhenTheAuthorReadsIt_ThenTheCommentAndReviewerAreThere()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        await SetDisplayNameAsync(admin, "Рецензент");
        var article = await CreateArticleAsync(author, "Вернуть автору");
        await MoveAsync(author, article.Id, "InReview");

        var returned = await admin.PostAsJsonAsync(
            $"/articles/{article.Id}/status", new { status = "Draft", comment = "  Добавьте источники.  " });
        returned.StatusCode.Should().Be(HttpStatusCode.OK);

        var read = await author.GetFromJsonAsync<ArticleReadDto>($"/articles/{article.Id}", ApiJson.Options);
        read!.Status.Should().Be(ArticleStatus.Draft);
        read.LastStatusChange.Should().NotBeNull();
        read.LastStatusChange!.FromStatus.Should().Be(ArticleStatus.InReview);
        read.LastStatusChange.ToStatus.Should().Be(ArticleStatus.Draft);
        read.LastStatusChange.Comment.Should().Be("Добавьте источники.");
        read.LastStatusChange.ChangedByDisplayName.Should().Be("Рецензент");
        var queue = await admin.GetFromJsonAsync<List<ReviewQueueItemDto>>("/articles/review-queue", ApiJson.Options);
        queue.Should().NotContain(entry => entry.Id == article.Id);
    }

    [Fact]
    public async Task GivenAReviewerApproves_WhenAnonymousReadsTheArticle_ThenItIsPublishedWithoutTheStatusLog()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var article = await CreateArticleAsync(author, "Одобрить");
        await MoveAsync(author, article.Id, "InReview");

        var approved = await admin.PostAsJsonAsync($"/articles/{article.Id}/status", new { status = "Published", comment = "Хорошо" });

        var answer = await approved.Content.ReadFromJsonAsync<ArticleReadDto>(ApiJson.Options);
        answer!.Status.Should().Be(ArticleStatus.Published);
        answer.LastStatusChange!.Comment.Should().Be("Хорошо");
        var anonymousRead = await _factory.CreateClient().GetFromJsonAsync<ArticleReadDto>($"/articles/{article.Id}", ApiJson.Options);
        anonymousRead!.LastStatusChange.Should().BeNull();
    }

    [Fact]
    public async Task GivenATooLongComment_WhenChangingStatus_ThenReturns400AndTheStatusStays()
    {
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var article = await CreateArticleAsync(admin, "Длинный комментарий");
        await MoveAsync(admin, article.Id, "InReview");

        var response = await admin.PostAsJsonAsync(
            $"/articles/{article.Id}/status", new { status = "Draft", comment = new string('а', 2001) });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("article_status_comment_too_long");
        var read = await admin.GetFromJsonAsync<ArticleReadDto>($"/articles/{article.Id}", ApiJson.Options);
        read!.Status.Should().Be(ArticleStatus.InReview);
    }

    private static async Task MoveAsync(HttpClient client, int articleId, string status)
    {
        var response = await client.PostAsJsonAsync($"/articles/{articleId}/status", new { status });
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    private static async Task SetDisplayNameAsync(HttpClient client, string name)
    {
        var response = await client.PutAsJsonAsync("/profile", new UserProfileWriteDto(name, null, null, null, null, null, null), ApiJson.Options);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    private static async Task<ArticleContentDto> CreateArticleAsync(HttpClient client, string title)
    {
        var dto = new ArticleContentCreateDto(
            title, null, [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Текст", true, [])] }],
            null, null, null, null, null);
        var response = await client.PostAsJsonAsync("/articles/content", dto);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ArticleContentDto>(ApiJson.Options))!;
    }

    private static async Task SaveAgainAsync(HttpClient client, ArticleContentDto article)
    {
        var update = article with
        {
            Paragraphs = [new ParagraphDto { Id = article.Paragraphs[0].Id, Order = 1, Opinions = [new OpinionDto { Content = "Новый текст", IsDefault = true }] }],
        };
        var response = await client.PutAsJsonAsync($"/articles/{article.Id}/content", update);
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }
}
