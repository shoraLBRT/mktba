using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.OpenApi.Models;
using Mktba.Api.Infrastructure;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Verification;
using Mktba.Domain.Entities;

namespace Mktba.Api.Endpoints;

/// <summary>
/// The signed-in user's application for the scholar status (V-01, #117) and its documents. The
/// admin's review of applications is <see cref="ScholarApplicationReviewEndpoints"/> (V-02, #118).
/// </summary>
public static class ScholarApplicationEndpoints
{
    private const string DegreeField = "degree";
    private const string InstitutionField = "institution";
    private const string SpecializationField = "specialization";
    private const string MazhabField = "mazhab";
    private const string DocumentsField = "documents";

    /// <summary>Room for the multipart framing and the text fields around the files.</summary>
    private const long MultipartOverheadBytes = 256 * 1024;

    private const string SubmitErrors =
        "Answers 400 with scholar_application_degree_required, scholar_application_degree_too_long, "
        + "scholar_application_institution_required, scholar_application_institution_too_long, "
        + "scholar_application_specialization_required, scholar_application_specialization_too_long (params.maxLength), "
        + "scholar_application_mazhab_invalid, scholar_application_documents_required, scholar_application_documents_too_many "
        + "(params.max), upload_file_required (an empty file), upload_too_large (params.maxMegabytes), "
        + "scholar_document_type_unsupported, scholar_document_pdf_invalid, upload_image_invalid or upload_image_too_many_pixels; "
        + "409 scholar_application_role_not_allowed (scholars and admins do not apply) or scholar_application_already_pending; "
        + "429 too_many_requests past the per-user upload limit.";

    /// <summary>Documents the request body: the text fields and the files under <see cref="DocumentsField"/>.</summary>
    private static OpenApiOperation MultipartApplicationBody(OpenApiOperation operation)
    {
        operation.RequestBody = new OpenApiRequestBody
        {
            Required = true,
            Content =
            {
                ["multipart/form-data"] = new OpenApiMediaType
                {
                    Schema = new OpenApiSchema
                    {
                        Type = "object",
                        Required = new HashSet<string> { DegreeField, InstitutionField, SpecializationField, DocumentsField },
                        Properties =
                        {
                            [DegreeField] = new OpenApiSchema { Type = "string", MaxLength = ScholarApplication.DegreeMaxLength },
                            [InstitutionField] = new OpenApiSchema { Type = "string", MaxLength = ScholarApplication.InstitutionMaxLength },
                            [SpecializationField] = new OpenApiSchema { Type = "string", MaxLength = ScholarApplication.SpecializationMaxLength },
                            [MazhabField] = new OpenApiSchema { Type = "string", Description = "hanafi, maliki, shafii or hanbali; empty for none." },
                            [DocumentsField] = new OpenApiSchema
                            {
                                Type = "array",
                                MaxItems = ScholarApplication.MaxDocuments,
                                Items = new OpenApiSchema { Type = "string", Format = "binary" },
                            },
                        },
                    },
                },
            },
        };
        return operation;
    }

    public static IEndpointRouteBuilder MapScholarApplicationEndpoints(this IEndpointRouteBuilder builder)
    {
        var options = builder.ServiceProvider.GetRequiredService<IOptions<UploadOptions>>().Value;
        var group = builder.MapGroup("/scholar-application")
            .WithTags("ScholarApplication")
            .RequireAuthorization(Policies.Authenticated);

        group.MapGet("/", async (ClaimsPrincipal principal, ScholarApplicationService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.GetMineAsync(userId, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithSummary("The signed-in user's latest application for the scholar status, and whether they may apply now.")
            .WithDescription("canApply is true for a reader or an author without a pending application. application is null when there is none.")
            .Produces<MyScholarApplicationDto>()
            .ProducesApiProblem(StatusCodes.Status401Unauthorized);

        group.MapPost("/", (HttpRequest request, ScholarApplicationService service, CancellationToken cancellationToken) =>
                SubmitAsync(request, service, options, cancellationToken))
            // Bearer tokens, not cookies, authorize this: a cross-site form cannot send one.
            .DisableAntiforgery()
            .RequireRateLimiting(RateLimitingSetup.UploadPolicy)
            .WithMetadata(new RequestSizeLimitAttribute(ScholarApplication.MaxDocuments * options.MaxBytes + MultipartOverheadBytes))
            .WithSummary("Applies for the scholar status; readers and authors.")
            .WithDescription(
                "A multipart form: degree, institution, specialization (one line each, required), mazhab (a canonical school's slug "
                + "or empty) and 1 to 5 files under documents. A document is a PDF (kept as it is, never rendered; checked by its "
                + "%PDF- header and %%EOF trailer) or a JPEG, PNG or WebP photo or scan (re-encoded as WebP of at most 4096 px "
                + "without metadata), each at most the upload limit. The documents are private: only the applicant and admins read "
                + "them, through GET /scholar-application/documents/{id}. The application stays Pending until an admin decides. "
                + SubmitErrors)
            .WithOpenApi(MultipartApplicationBody)
            .Produces<ScholarApplicationDto>(StatusCodes.Status201Created)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status401Unauthorized, StatusCodes.Status409Conflict, StatusCodes.Status429TooManyRequests);

        group.MapPost("/withdraw", async (ClaimsPrincipal principal, ScholarApplicationService service, CancellationToken cancellationToken) =>
                principal.GetUserId() is int userId
                    ? Results.Ok(await service.WithdrawAsync(userId, cancellationToken))
                    : ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized))
            .WithSummary("Withdraws the signed-in user's pending application and deletes its documents.")
            .WithDescription("Answers with the new state (the application Withdrawn, without documents); 404 scholar_application_not_found when nothing is pending; 409 scholar_application_not_pending when an admin decided first.")
            .Produces<MyScholarApplicationDto>()
            .ProducesApiProblem(StatusCodes.Status401Unauthorized, StatusCodes.Status404NotFound, StatusCodes.Status409Conflict);

        group.MapGet("/documents/{id:int}", async (int id, ClaimsPrincipal principal, HttpResponse response, ScholarApplicationService service, CancellationToken cancellationToken) =>
            {
                if (principal.GetUserId() is not int userId)
                {
                    return ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized);
                }

                var document = await service.OpenDocumentAsync(id, userId, cancellationToken);
                // Personal data: kept out of every cache, never sniffed, never run as a page.
                response.Headers.CacheControl = "private, no-store";
                response.Headers.XContentTypeOptions = "nosniff";
                response.Headers.ContentSecurityPolicy = "default-src 'none'; sandbox";
                return Results.Stream(document.Content, document.ContentType, fileDownloadName: document.FileName);
            })
            .WithSummary("One document of an application, as a download; its applicant and admins only.")
            .WithDescription("Content-Disposition: attachment, no caching. Answers 404 scholar_document_not_found to anyone else, so ids cannot be probed.")
            .Produces(StatusCodes.Status200OK, contentType: "application/octet-stream")
            .ProducesApiProblem(StatusCodes.Status401Unauthorized, StatusCodes.Status404NotFound);

        return builder;
    }

    /// <summary>
    /// The form is read here rather than bound: a bound file makes routing answer 415 to a request of
    /// another content type before authorization runs.
    /// </summary>
    private static async Task<IResult> SubmitAsync(
        HttpRequest request, ScholarApplicationService service, UploadOptions options, CancellationToken cancellationToken)
    {
        if (request.HttpContext.User.GetUserId() is not int userId)
        {
            return ApiProblemResults.Problem(StatusCodes.Status401Unauthorized, AppErrors.Unauthorized);
        }

        if (!request.HasFormContentType)
        {
            throw new ValidationException(AppErrors.BadRequest);
        }

        IFormCollection form;
        try
        {
            form = await request.ReadFormAsync(cancellationToken);
        }
        catch (Exception exception) when (exception is InvalidDataException or (IOException and not BadHttpRequestException))
        {
            throw new ValidationException(AppErrors.BadRequest);
        }

        var files = form.Files.GetFiles(DocumentsField);
        if (files.Any(file => file.Length > options.MaxBytes))
        {
            throw new ValidationException(AppErrors.UploadTooLarge(Mktba.Application.Services.Uploads.ImageUploadService.MaxMegabytes(options.MaxBytes)));
        }

        var input = new ScholarApplicationInput(form[DegreeField], form[InstitutionField], form[SpecializationField], form[MazhabField]);
        var streams = new List<Stream>(files.Count);
        try
        {
            var documents = files.Select(file =>
            {
                var stream = file.OpenReadStream();
                streams.Add(stream);
                return new ScholarDocumentUpload(file.FileName, stream);
            }).ToList();
            var created = await service.SubmitAsync(userId, input, documents, cancellationToken);
            return Results.Created("/scholar-application", created);
        }
        finally
        {
            foreach (var stream in streams)
            {
                await stream.DisposeAsync();
            }
        }
    }
}
