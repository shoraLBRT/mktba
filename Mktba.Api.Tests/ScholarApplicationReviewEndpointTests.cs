using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Api.Tests;

/// <summary>
/// V-02 (#118): the admin reviews scholar applications over HTTP. Who may call the endpoints is
/// <see cref="EndpointAuthorizationMatrixTests"/>; the rules in detail are the application tests.
/// Runs on both providers: on PostgreSQL the decision, its audit entry and the role go in one save.
/// </summary>
public abstract class ScholarApplicationReviewEndpointTests
{
    private static readonly byte[] Pdf = Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");

    private readonly MktbaApiFactory _factory;

    protected ScholarApplicationReviewEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenPendingApplication_WhenTheAdminApprovesIt_ThenTheApplicantIsAScholarAndTheLogShowsIt()
    {
        var (reader, readerId) = await RoleClients.CreateAsync(_factory, UserRole.Reader);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var application = await SubmitAsync(reader);

        var list = await admin.GetFromJsonAsync<ScholarApplicationPageDto>("/scholar-applications?status=Pending&pageSize=100", ApiJson.Options);
        list!.Items.Should().Contain(item => item.Id == application.Id && item.Applicant.Id == readerId && item.DocumentCount == 1);
        var detail = await admin.GetFromJsonAsync<ScholarApplicationReviewDto>($"/scholar-applications/{application.Id}", ApiJson.Options);
        (detail!.CanApprove, detail.CanReject, detail.CanRevoke).Should().Be((true, true, false));
        (await admin.GetAsync($"/scholar-application/documents/{detail.Application.Documents[0].Id}")).StatusCode.Should().Be(HttpStatusCode.OK);

        var approved = await admin.PostAsync($"/scholar-applications/{application.Id}/approve", null);

        approved.StatusCode.Should().Be(HttpStatusCode.OK);
        var review = await approved.Content.ReadFromJsonAsync<ScholarApplicationReviewDto>(ApiJson.Options);
        review!.Application.Status.Should().Be(ScholarApplicationStatus.Approved);
        review.Applicant.Role.Should().Be(UserRole.Scholar);
        var me = await reader.GetFromJsonAsync<JsonElement>("/auth/me");
        me.GetProperty("role").GetString().Should().Be("Scholar");
        var log = await admin.GetFromJsonAsync<AuditLogPageDto>($"/audit-log?targetUserId={readerId}", ApiJson.Options);
        log!.Items.Select(entry => entry.Action).Should().BeEquivalentTo(new[] { AuditAction.ScholarApplicationApproved, AuditAction.UserRoleChanged });

        var again = await admin.PostAsync($"/scholar-applications/{application.Id}/approve", null);
        again.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ErrorCodeAsync(again)).Should().Be("scholar_application_not_pending");
    }

    [Fact]
    public async Task GivenPendingApplication_WhenRejected_ThenTheReasonReachesTheApplicantAndTheDocumentIsGone()
    {
        var (reader, _) = await RoleClients.CreateAsync(_factory, UserRole.Reader);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var application = await SubmitAsync(reader);
        var documentUrl = $"/scholar-application/documents/{application.Documents[0].Id}";

        var blank = await admin.PostAsJsonAsync($"/scholar-applications/{application.Id}/reject", new ScholarDecisionDto(" "));
        blank.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ErrorCodeAsync(blank)).Should().Be("scholar_decision_reason_required");

        var rejected = await admin.PostAsJsonAsync($"/scholar-applications/{application.Id}/reject", new ScholarDecisionDto("Скан нечитаем."));

        rejected.StatusCode.Should().Be(HttpStatusCode.OK);
        var mine = await reader.GetFromJsonAsync<MyScholarApplicationDto>("/scholar-application", ApiJson.Options);
        mine!.CanApply.Should().BeTrue();
        (mine.Application!.Status, mine.Application.DecisionReason).Should().Be((ScholarApplicationStatus.Rejected, "Скан нечитаем."));
        mine.Application.Documents.Should().BeEmpty();
        (await admin.GetAsync(documentUrl)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GivenApprovedApplication_WhenRevoked_ThenTheUserGetsTheirRoleBackAndSeesTheReason()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var application = await SubmitAsync(author);
        (await admin.PostAsync($"/scholar-applications/{application.Id}/approve", null)).EnsureSuccessStatusCode();

        var revoked = await admin.PostAsJsonAsync($"/scholar-applications/{application.Id}/revoke", new ScholarDecisionDto("Степень не подтвердилась."));

        revoked.StatusCode.Should().Be(HttpStatusCode.OK);
        var review = await revoked.Content.ReadFromJsonAsync<ScholarApplicationReviewDto>(ApiJson.Options);
        (review!.Application.Status, review.Applicant.Role).Should().Be((ScholarApplicationStatus.Revoked, UserRole.Author));
        var mine = await author.GetFromJsonAsync<MyScholarApplicationDto>("/scholar-application", ApiJson.Options);
        (mine!.CanApply, mine.Application!.DecisionReason).Should().Be((true, "Степень не подтвердилась."));

        var missing = await admin.PostAsJsonAsync("/scholar-applications/999999/revoke", new ScholarDecisionDto("Нет"));
        missing.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    private static async Task<ScholarApplicationDto> SubmitAsync(HttpClient client)
    {
        var form = new MultipartFormDataContent
        {
            { new StringContent("Доктор наук"), "degree" },
            { new StringContent("Университет"), "institution" },
            { new StringContent("Фикх"), "specialization" },
        };
        var file = new ByteArrayContent(Pdf);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        form.Add(file, "documents", "диплом.pdf");
        var response = await client.PostAsync("/scholar-application", form);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ScholarApplicationDto>(ApiJson.Options))!;
    }

    private static async Task<string?> ErrorCodeAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    /// <summary>On the InMemory provider.</summary>
    public sealed class InMemory(MktbaApiFactory factory) : ScholarApplicationReviewEndpointTests(factory), IClassFixture<MktbaApiFactory>;

    /// <summary>On a real PostgreSQL database (X-07, #161).</summary>
    public sealed class OnPostgres(PostgresApiFactory factory) : ScholarApplicationReviewEndpointTests(factory), IClassFixture<PostgresApiFactory>;
}
