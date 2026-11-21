namespace Mktba.Application.DTOs;

/// <summary>
/// An uploaded image as stored (U-08, #73): always WebP, re-encoded, at most 512 px (avatar) or
/// 2048 px (article image) on its longer side. <c>url</c> is absolute and never changes; put it
/// where the image is used (for example the profile's <c>avatarUrl</c>).
/// </summary>
public sealed record UploadedImageDto(string Url, string ContentType, int Width, int Height, long SizeBytes);
