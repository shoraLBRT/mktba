using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>U-09 (#135): the API's role changes, status moves and trash actions land in the admin-only audit log.</summary>
public sealed class AuditLogEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public AuditLogEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenAdmin_WhenChangingARole_ThenTheLogNamesTheAdminAndTheUser()
    {
        var (admin, adminId) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (_, readerId) = await RoleClients.CreateUserAsync(_factory, UserRole.Reader);

        (await admin.PutAsJsonAsync($"/users/{readerId}/role", new { Role = "Author" })).EnsureSuccessStatusCode();

        var page = await admin.GetFromJsonAsync<AuditLogPageDto>($"/audit-log?targetUserId={readerId}", ApiJson.Options);
        page!.Items.Should().ContainSingle().Which.Should().BeEquivalentTo(new
        {
            Action = AuditAction.UserRoleChanged,
            ActorId = (int?)adminId,
            TargetUserId = (int?)readerId,
            FromValue = "Reader",
            ToValue = "Author",
        });
    }

    [Fact]
    public async Task GivenAdmin_WhenPublishingTrashingAndPurging_ThenEachActionIsLoggedForTheArticle()
    {
        var (admin, adminId) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var title = $"Журнал {Guid.NewGuid():N}";
        var created = await CreateArticleAsync(admin, title);

        (await admin.PostAsJsonAsync($"/articles/{created.Id}/status", new { Status = "InReview" })).EnsureSuccessStatusCode();
        (await admin.PostAsJsonAsync($"/articles/{created.Id}/status", new { Status = "Published" })).EnsureSuccessStatusCode();
        (await admin.DeleteAsync($"/articles/{created.Id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await admin.PostAsync($"/articles/trash/{created.Id}/restore", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await admin.DeleteAsync($"/articles/{created.Id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await admin.DeleteAsync($"/articles/trash/{created.Id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var page = await admin.GetFromJsonAsync<AuditLogPageDto>($"/audit-log?articleId={created.Id}", ApiJson.Options);
        page!.Items.Select(entry => entry.Action).Should().Equal(
            AuditAction.ArticlePurged,
            AuditAction.ArticleTrashed,
            AuditAction.ArticleRestored,
            AuditAction.ArticleTrashed,
            AuditAction.ArticleStatusChanged,
            AuditAction.ArticleStatusChanged);
        page.Items.Should().OnlyContain(entry => entry.ActorId == adminId && entry.ArticleTitle == title && !entry.ArticleAvailable);
        page.Items[4].ToValue.Should().Be("Published");

        var purges = await admin.GetFromJsonAsync<AuditLogPageDto>(
            $"/audit-log?action=ArticlePurged&actorId={adminId}", ApiJson.Options);
        purges!.Items.Should().ContainSingle().Which.ArticleId.Should().Be(created.Id);
    }

    [Fact]
    public async Task GivenNonAdmin_WhenReadingTheLog_ThenItIsRefused()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);

        (await author.GetAsync("/audit-log")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await _factory.CreateClient().GetAsync("/audit-log")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
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
}
