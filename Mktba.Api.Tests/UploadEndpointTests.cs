using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using SkiaSharp;

namespace Mktba.Api.Tests;

/// <summary>
/// U-08 (#73): uploading an image and reading it back over HTTP. Who may upload is covered by
/// <see cref="EndpointAuthorizationMatrixTests"/>; what the image becomes by the application tests.
/// </summary>
public sealed class UploadEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public UploadEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenReader_WhenUploadingAvatar_ThenItIsStoredAndServedAsWebpUnderItsUrl()
    {
        var (reader, _) = await RoleClients.CreateAsync(_factory, UserRole.Reader);

        var response = await reader.PostAsync("/uploads/avatar", Form(Png(800, 400), "photo.png", "image/png"));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var uploaded = await response.Content.ReadFromJsonAsync<UploadedImageDto>(ApiJson.Options);
        uploaded!.Url.Should().MatchRegex("^http://localhost/files/[0-9a-f]{32}\\.webp$");
        response.Headers.Location!.ToString().Should().Be(uploaded.Url);
        (uploaded.Width, uploaded.Height, uploaded.ContentType).Should().Be((512, 256, "image/webp"));

        var file = await _factory.CreateClient().GetAsync(new Uri(uploaded.Url).PathAndQuery);

        file.StatusCode.Should().Be(HttpStatusCode.OK);
        file.Content.Headers.ContentType!.MediaType.Should().Be("image/webp");
        file.Headers.GetValues("X-Content-Type-Options").Should().Equal("nosniff");
        file.Headers.CacheControl!.ToString().Should().Contain("immutable");
        (await file.Content.ReadAsByteArrayAsync()).LongLength.Should().Be(uploaded.SizeBytes);
    }

    [Fact]
    public async Task GivenAuthor_WhenUploadingImage_ThenTheUploadIsRecordedUnderTheAuthor()
    {
        var (author, authorId) = await RoleClients.CreateAsync(_factory, UserRole.Author);

        var response = await author.PostAsync("/uploads/images", Form(Png(64, 32), "chart.png", "image/png"));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var uploaded = await response.Content.ReadFromJsonAsync<UploadedImageDto>(ApiJson.Options);
        var name = new Uri(uploaded!.Url).Segments[^1];
        using var scope = _factory.Services.CreateScope();
        var record = await scope.ServiceProvider.GetRequiredService<MktbaDbContext>()
            .StoredFiles.AsNoTracking().SingleAsync(stored => stored.Name == name);
        record.UploadedById.Should().Be(authorId);
        (record.Purpose, record.SizeBytes, record.Width, record.Height).Should().Be((StoredFilePurpose.ArticleImage, uploaded.SizeBytes, 64, 32));
    }

    [Fact]
    public async Task GivenTlsTerminatingProxy_WhenUploading_ThenTheUrlKeepsTheVisitorsHttpsScheme()
    {
        // X-01 (#63): Caddy terminates TLS and talks to the API over http, passing X-Forwarded-Proto.
        const string proxy = "10.0.0.2";
        await using var factory = new MktbaApiFactory("Testing", MktbaApiFactory.TestSigningKey, new Dictionary<string, string>
        {
            ["ForwardedHeaders:KnownProxies:0"] = proxy,
            ["RateLimiting:Auth:PermitLimit"] = "10000",
            ["RateLimiting:Uploads:PermitLimit"] = "10000",
        });
        var (reader, _) = await RoleClients.CreateAsync(factory, UserRole.Reader);
        reader.DefaultRequestHeaders.Add(MktbaApiFactory.RemoteIpHeader, proxy);
        reader.DefaultRequestHeaders.Add("X-Forwarded-Proto", "https");

        var response = await reader.PostAsync("/uploads/avatar", Form(Png(64, 64), "photo.png", "image/png"));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var uploaded = await response.Content.ReadFromJsonAsync<UploadedImageDto>(ApiJson.Options);
        uploaded!.Url.Should().MatchRegex("^https://localhost/files/[0-9a-f]{32}\\.webp$");
    }

    [Fact]
    public async Task GivenSvgSentAsPng_WhenUploading_ThenItIsRefusedByItsContentNotItsDeclaredType()
    {
        var (reader, _) = await RoleClients.CreateAsync(_factory, UserRole.Reader);
        var svg = Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>");

        var storedBefore = StoredFileCount();

        var response = await reader.PostAsync("/uploads/avatar", Form(svg, "avatar.png", "image/png"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ErrorCodeAsync(response)).Should().Be("upload_type_unsupported");
        StoredFileCount().Should().Be(storedBefore);
    }

    private int StoredFileCount() =>
        Directory.Exists(_factory.StorageRoot) ? Directory.EnumerateFiles(_factory.StorageRoot).Count() : 0;

    [Fact]
    public async Task GivenFormWithoutTheFileField_WhenUploading_ThenItIsRefusedAsMissing()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);

        var response = await author.PostAsync(
            "/uploads/images", new MultipartFormDataContent { { new StringContent("x"), "other" } });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ErrorCodeAsync(response)).Should().Be("upload_file_required");
    }

    [Fact]
    public async Task GivenAuthor_WhenUploadingArticleImage_ThenItKeepsUpTo2048Pixels()
    {
        var (author, _) = await RoleClients.CreateAsync(_factory, UserRole.Author);

        var response = await author.PostAsync("/uploads/images", Form(Png(1200, 900), "figure.png", "image/png"));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var uploaded = await response.Content.ReadFromJsonAsync<UploadedImageDto>(ApiJson.Options);
        (uploaded!.Width, uploaded.Height).Should().Be((1200, 900));
    }

    [Fact]
    public async Task GivenMultipartBodyWithoutAnyPart_WhenUploading_ThenItIsABadRequestNotAServerError()
    {
        var (reader, _) = await RoleClients.CreateAsync(_factory, UserRole.Reader);

        var response = await reader.PostAsync("/uploads/avatar", new MultipartFormDataContent());

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ErrorCodeAsync(response)).Should().Be("bad_request");
    }

    [Theory]
    [InlineData("0123456789abcdef0123456789abcdef.webp")]
    [InlineData("0123456789abcdef0123456789abcdef.svg")]
    [InlineData("appsettings.json")]
    public async Task GivenNameOfNoStoredFile_WhenRead_ThenNotFound(string name)
    {
        var response = await _factory.CreateClient().GetAsync($"/files/{name}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await ErrorCodeAsync(response)).Should().Be("file_not_found");
    }

    private static MultipartFormDataContent Form(byte[] content, string fileName, string contentType)
    {
        var file = new ByteArrayContent(content);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return new MultipartFormDataContent { { file, "file", fileName } };
    }

    private static byte[] Png(int width, int height)
    {
        using var bitmap = new SKBitmap(width, height);
        bitmap.Erase(SKColors.SeaGreen);
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }

    private static async Task<string?> ErrorCodeAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("code").GetString();
}
