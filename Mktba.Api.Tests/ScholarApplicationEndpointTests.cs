using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using SkiaSharp;

namespace Mktba.Api.Tests;

/// <summary>
/// V-01 (#117): applying for the scholar status over HTTP and reading its documents back. Who may
/// call the endpoints at all is <see cref="EndpointAuthorizationMatrixTests"/>; the rules in detail
/// are the application tests. Runs on both providers: on PostgreSQL a withdrawn and a new pending
/// application of one user also prove the one-pending index is filtered.
/// </summary>
public abstract class ScholarApplicationEndpointTests
{
    private static readonly byte[] Pdf = Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");

    private readonly MktbaApiFactory _factory;

    protected ScholarApplicationEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenReader_WhenApplyingWithAPdfAndAScan_ThenTheApplicationIsPendingAndTheyCannotApplyAgain()
    {
        var (reader, _) = await RoleClients.CreateAsync(_factory, UserRole.Reader);
        (await StateAsync(reader)).Should().Be(new MyScholarApplicationDto(true, null));

        var response = await reader.PostAsync("/scholar-application", Form(("диплом.pdf", Pdf, "application/pdf"), ("скан.png", Png(), "image/png")));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var application = await response.Content.ReadFromJsonAsync<ScholarApplicationDto>(ApiJson.Options);
        application!.Status.Should().Be(ScholarApplicationStatus.Pending);
        (application.Degree, application.Institution, application.Specialization, application.Mazhab)
            .Should().Be(("Доктор наук", "Университет аль-Азхар", "Фикх", "shafii"));
        application.Documents.Select(document => (document.FileName, document.ContentType))
            .Should().Equal(("диплом.pdf", "application/pdf"), ("скан.webp", "image/webp"));

        var state = await StateAsync(reader);
        state.CanApply.Should().BeFalse();
        state.Application!.Id.Should().Be(application.Id);

        var again = await reader.PostAsync("/scholar-application", Form(("диплом.pdf", Pdf, "application/pdf")));
        again.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ErrorCodeAsync(again)).Should().Be("scholar_application_already_pending");
    }

    [Fact]
    public async Task GivenApplication_WhenItsDocumentIsRead_ThenTheApplicantAndAdminsGetItAsAPrivateDownloadAndNobodyElse()
    {
        var (reader, _) = await RoleClients.CreateAsync(_factory, UserRole.Reader);
        var (admin, _) = await RoleClients.CreateAsync(_factory, UserRole.Admin);
        var (other, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);
        var application = await SubmitAsync(reader);
        var url = $"/scholar-application/documents/{application.Documents[0].Id}";

        foreach (var client in new[] { reader, admin })
        {
            var file = await client.GetAsync(url);

            file.StatusCode.Should().Be(HttpStatusCode.OK);
            (await file.Content.ReadAsByteArrayAsync()).Should().Equal(Pdf);
            file.Content.Headers.ContentType!.MediaType.Should().Be("application/pdf");
            file.Content.Headers.ContentDisposition!.DispositionType.Should().Be("attachment");
            file.Content.Headers.ContentDisposition.FileNameStar.Should().Be("диплом.pdf");
            file.Headers.CacheControl!.NoStore.Should().BeTrue();
            file.Headers.CacheControl.Private.Should().BeTrue();
            file.Headers.GetValues("X-Content-Type-Options").Should().Equal("nosniff");
        }

        var refused = await other.GetAsync(url);
        refused.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await ErrorCodeAsync(refused)).Should().Be("scholar_document_not_found");
        (await _factory.CreateClient().GetAsync(url)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GivenStoredDocument_WhenAskedForThroughThePublicFiles_ThenItIsNotServed()
    {
        var (reader, _) = await RoleClients.CreateAsync(_factory, UserRole.Reader);
        var application = await SubmitAsync(reader);
        using var scope = _factory.Services.CreateScope();
        var name = await scope.ServiceProvider.GetRequiredService<MktbaDbContext>().ScholarApplicationDocuments.AsNoTracking()
            .Where(document => document.Id == application.Documents[0].Id).Select(document => document.StoredFile.Name).SingleAsync();
        name.Should().StartWith("private/");
        File.Exists(Path.Combine(_factory.StorageRoot, name)).Should().BeTrue();

        var anonymous = _factory.CreateClient();
        foreach (var path in new[] { "/files/" + Uri.EscapeDataString(name), "/files/" + name[8..], "/files/private/" + name[8..], "/files/..%2F" + Uri.EscapeDataString(name) })
        {
            (await anonymous.GetAsync(path)).StatusCode.Should().Be(HttpStatusCode.NotFound, path);
        }
    }

    [Fact]
    public async Task GivenPendingApplication_WhenWithdrawn_ThenItsDocumentsAreGoneAndTheReaderMayApplyAgain()
    {
        var (reader, _) = await RoleClients.CreateAsync(_factory, UserRole.Reader);
        var application = await SubmitAsync(reader);

        var response = await reader.PostAsync("/scholar-application/withdraw", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var state = await response.Content.ReadFromJsonAsync<MyScholarApplicationDto>(ApiJson.Options);
        state!.CanApply.Should().BeTrue();
        state.Application!.Status.Should().Be(ScholarApplicationStatus.Withdrawn);
        state.Application.Documents.Should().BeEmpty();
        (await reader.GetAsync($"/scholar-application/documents/{application.Documents[0].Id}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await reader.PostAsync("/scholar-application/withdraw", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);

        (await reader.PostAsync("/scholar-application", Form(("диплом.pdf", Pdf, "application/pdf")))).StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task GivenScholar_WhenApplying_ThenItIsAConflictAndTheyCannotApply()
    {
        var (scholar, _) = await RoleClients.CreateAsync(_factory, UserRole.Scholar);

        var response = await scholar.PostAsync("/scholar-application", Form(("диплом.pdf", Pdf, "application/pdf")));

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ErrorCodeAsync(response)).Should().Be("scholar_application_role_not_allowed");
        (await StateAsync(scholar)).CanApply.Should().BeFalse();
    }

    [Fact]
    public async Task GivenFileRenamedToPdf_WhenApplying_ThenItIsRefusedAndNothingIsStored()
    {
        var (author, authorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);

        var response = await author.PostAsync("/scholar-application", Form(("диплом.pdf", "<html>"u8.ToArray(), "application/pdf")));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ErrorCodeAsync(response)).Should().Be("scholar_document_type_unsupported");
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
        (await db.StoredFiles.AnyAsync(file => file.UploadedById == authorId)).Should().BeFalse();
        (await db.ScholarApplications.AnyAsync(application => application.UserId == authorId)).Should().BeFalse();
    }

    [Fact]
    public async Task GivenFormWithoutDocuments_WhenApplying_ThenTheyAreRequired()
    {
        var (reader, _) = await RoleClients.CreateAsync(_factory, UserRole.Reader);

        var response = await reader.PostAsync("/scholar-application", Form());

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ErrorCodeAsync(response)).Should().Be("scholar_application_documents_required");
    }

    [Fact]
    public async Task GivenJsonInsteadOfAForm_WhenApplying_ThenItIsABadRequest()
    {
        var (reader, _) = await RoleClients.CreateAsync(_factory, UserRole.Reader);

        var response = await reader.PostAsJsonAsync("/scholar-application", new { degree = "Магистр" });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ErrorCodeAsync(response)).Should().Be("bad_request");
    }

    private static async Task<MyScholarApplicationDto> StateAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<MyScholarApplicationDto>("/scholar-application", ApiJson.Options))!;

    private static async Task<ScholarApplicationDto> SubmitAsync(HttpClient client)
    {
        var response = await client.PostAsync("/scholar-application", Form(("диплом.pdf", Pdf, "application/pdf")));
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<ScholarApplicationDto>(ApiJson.Options))!;
    }

    private static MultipartFormDataContent Form(params (string Name, byte[] Content, string ContentType)[] documents)
    {
        var form = new MultipartFormDataContent
        {
            { new StringContent("Доктор  наук"), "degree" },
            { new StringContent("Университет аль-Азхар"), "institution" },
            { new StringContent("Фикх"), "specialization" },
            { new StringContent("shafii"), "mazhab" },
        };
        foreach (var (name, content, contentType) in documents)
        {
            var file = new ByteArrayContent(content);
            file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
            form.Add(file, "documents", name);
        }

        return form;
    }

    private static byte[] Png()
    {
        using var bitmap = new SKBitmap(64, 48);
        bitmap.Erase(SKColors.SeaGreen);
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }

    private static async Task<string?> ErrorCodeAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    /// <summary>On the InMemory provider.</summary>
    public sealed class InMemory(MktbaApiFactory factory) : ScholarApplicationEndpointTests(factory), IClassFixture<MktbaApiFactory>;

    /// <summary>On a real PostgreSQL database (X-07, #161).</summary>
    public sealed class OnPostgres(PostgresApiFactory factory) : ScholarApplicationEndpointTests(factory), IClassFixture<PostgresApiFactory>;
}
