using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.OpenApi.Models;
using Mktba.Api.Infrastructure;
using Mktba.Application.Configuration;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services.Uploads;
using Mktba.Infrastructure.Storage;

namespace Mktba.Api.Endpoints;

/// <summary>File uploads and the stored files (U-08, #73).</summary>
public static class UploadEndpoints
{
    private const string UploadErrors =
        "The file goes as the multipart form field file. The format is read from the file itself, not from its name or "
        + "Content-Type: only JPEG, PNG and WebP; the image is turned upright, scaled down and re-encoded as WebP without "
        + "any metadata. Answers 400 with upload_file_required, upload_too_large (params.maxMegabytes), "
        + "upload_type_unsupported, upload_image_invalid or upload_image_too_many_pixels (params.maxMegapixels); "
        + "429 too_many_requests past the per-user upload limit.";

    private const string FileField = "file";

    /// <summary>Documents the request body: a multipart form with the file in <see cref="FileField"/>.</summary>
    private static OpenApiOperation MultipartFileBody(OpenApiOperation operation)
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
                        Required = new HashSet<string> { FileField },
                        Properties = { [FileField] = new OpenApiSchema { Type = "string", Format = "binary" } },
                    },
                },
            },
        };
        return operation;
    }

    /// <summary>Room for the multipart framing around the file itself.</summary>
    private const long MultipartOverheadBytes = 64 * 1024;

    public static IEndpointRouteBuilder MapUploadEndpoints(this IEndpointRouteBuilder builder)
    {
        var options = builder.ServiceProvider.GetRequiredService<IOptions<UploadOptions>>().Value;
        var requestLimit = new RequestSizeLimitAttribute(options.MaxBytes + MultipartOverheadBytes);

        var uploads = builder.MapGroup("/uploads")
            .WithTags("Uploads")
            // Bearer tokens, not cookies, authorize these: a cross-site form cannot send one.
            .DisableAntiforgery()
            .RequireRateLimiting(RateLimitingSetup.UploadPolicy)
            .WithMetadata(requestLimit);

        uploads.MapPost("/avatar", (HttpRequest request, ImageUploadService service, CancellationToken cancellationToken) =>
                UploadAsync(ImageUploadPurpose.Avatar, request, service, options, cancellationToken))
            .RequireAuthorization(Policies.Authenticated)
            .WithSummary("Uploads an avatar image; any signed-in user.")
            .WithDescription("At most 512 px on the longer side. The profile is not changed: save the returned url as avatarUrl. " + UploadErrors)
            .WithOpenApi(MultipartFileBody)
            .Produces<UploadedImageDto>(StatusCodes.Status201Created)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status401Unauthorized, StatusCodes.Status429TooManyRequests);

        uploads.MapPost("/images", (HttpRequest request, ImageUploadService service, CancellationToken cancellationToken) =>
                UploadAsync(ImageUploadPurpose.ArticleImage, request, service, options, cancellationToken))
            .RequireAuthorization(Policies.CanEditArticles)
            .WithSummary("Uploads an image for an article; authors and admins.")
            .WithDescription("At most 2048 px on the longer side. " + UploadErrors)
            .WithOpenApi(MultipartFileBody)
            .Produces<UploadedImageDto>(StatusCodes.Status201Created)
            .ProducesApiProblem(StatusCodes.Status400BadRequest, StatusCodes.Status401Unauthorized, StatusCodes.Status403Forbidden, StatusCodes.Status429TooManyRequests);

        builder.MapGet("/files/{name}", async (string name, HttpResponse response, IFileStorage storage, CancellationToken cancellationToken) =>
            {
                var contentType = StoredFileNames.ContentTypeOf(name);
                var stream = contentType is null ? null : await storage.OpenReadAsync(name, cancellationToken);
                if (stream is null)
                {
                    return ApiProblemResults.Problem(StatusCodes.Status404NotFound, AppErrors.FileNotFound);
                }

                // A stored file never changes (a new upload gets a new name), and is only ever an image.
                response.Headers.CacheControl = "public, max-age=31536000, immutable";
                response.Headers.XContentTypeOptions = "nosniff";
                response.Headers.ContentSecurityPolicy = "default-src 'none'; sandbox";
                return Results.Stream(stream, contentType);
            })
            .WithTags("Uploads")
            .WithSummary("A stored file, by name.")
            .WithDescription("Public. Served with its own content type (only images are stored), nosniff and a year-long immutable cache. Answers 404 file_not_found.")
            .Produces(StatusCodes.Status200OK, contentType: "image/webp")
            .ProducesApiProblem(StatusCodes.Status404NotFound);

        return builder;
    }

    /// <summary>
    /// The form is read here rather than bound as an IFormFile parameter: a bound file makes routing
    /// answer 415 to a request of another content type before authorization runs.
    /// </summary>
    private static async Task<IResult> UploadAsync(
        ImageUploadPurpose purpose, HttpRequest request, ImageUploadService service, UploadOptions options, CancellationToken cancellationToken)
    {
        var file = request.HasFormContentType ? await ReadFileAsync(request, cancellationToken) : null;
        if (file is null || file.Length == 0)
        {
            throw new ValidationException(AppErrors.UploadFileRequired);
        }

        if (file.Length > options.MaxBytes)
        {
            throw new ValidationException(AppErrors.UploadTooLarge(ImageUploadService.MaxMegabytes(options.MaxBytes)));
        }

        await using var content = file.OpenReadStream();
        var stored = await service.UploadAsync(content, purpose, cancellationToken);
        var url = PublicUrl(stored.Name, options, request);
        return Results.Created(url, new UploadedImageDto(url, stored.ContentType, stored.Width, stored.Height, stored.SizeBytes));
    }

    /// <summary>The form's <see cref="FileField"/>; a body that is not a readable multipart form is a 400 bad_request.</summary>
    private static async Task<IFormFile?> ReadFileAsync(HttpRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return (await request.ReadFormAsync(cancellationToken)).Files.GetFile(FileField);
        }
        catch (Exception exception) when (exception is InvalidDataException or (IOException and not BadHttpRequestException))
        {
            throw new ValidationException(AppErrors.BadRequest);
        }
    }

    /// <summary>Where readers get a stored file: <c>Uploads:PublicBaseUrl</c>, else this API's <c>/files/</c>.</summary>
    private static string PublicUrl(string name, UploadOptions options, HttpRequest request)
    {
        var baseUrl = string.IsNullOrWhiteSpace(options.PublicBaseUrl)
            ? $"{request.Scheme}://{request.Host}{request.PathBase}/files/"
            : options.PublicBaseUrl.Trim();
        return baseUrl.EndsWith('/') ? baseUrl + name : baseUrl + "/" + name;
    }
}
