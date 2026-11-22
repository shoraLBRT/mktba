using System.Net;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;

namespace Mktba.Infrastructure.Storage;

/// <summary>
/// Keeps files in a bucket of an S3-compatible service. The objects are written private (no ACL);
/// readers get them through <c>GET /files/{name}</c> or, when the bucket or a CDN in front of it
/// is public, straight from there (<c>Uploads:PublicBaseUrl</c>).
/// </summary>
public sealed class S3FileStorage : IFileStorage, IDisposable
{
    private readonly IAmazonS3 _client;
    private readonly S3FileStorageOptions _options;

    public S3FileStorage(S3FileStorageOptions options)
    {
        if (string.IsNullOrWhiteSpace(options.Bucket))
        {
            throw new InvalidOperationException("Storage:S3:Bucket must be set when Storage:Provider is S3.");
        }

        _options = options;
        var config = new AmazonS3Config
        {
            ForcePathStyle = options.ForcePathStyle,
            // S3-compatible services other than AWS do not all accept the SDK's default checksums.
            RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
            ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED,
        };
        if (!string.IsNullOrWhiteSpace(options.ServiceUrl))
        {
            config.ServiceURL = options.ServiceUrl;
            config.AuthenticationRegion = options.Region;
        }
        else
        {
            config.RegionEndpoint = Amazon.RegionEndpoint.GetBySystemName(options.Region);
        }

        _client = string.IsNullOrWhiteSpace(options.AccessKey)
            ? new AmazonS3Client(config)
            : new AmazonS3Client(new BasicAWSCredentials(options.AccessKey, options.SecretKey), config);
    }

    public async Task SaveAsync(string name, ReadOnlyMemory<byte> content, string contentType, CancellationToken cancellationToken)
    {
        using var stream = new MemoryStream(content.ToArray(), writable: false);
        await _client.PutObjectAsync(new PutObjectRequest
        {
            BucketName = _options.Bucket,
            Key = KeyOf(name),
            InputStream = stream,
            ContentType = contentType,
            UseChunkEncoding = false,
            Headers = { CacheControl = "public, max-age=31536000, immutable" },
        }, cancellationToken);
    }

    public async Task<Stream?> OpenReadAsync(string name, CancellationToken cancellationToken)
    {
        try
        {
            var response = await _client.GetObjectAsync(_options.Bucket, KeyOf(name), cancellationToken);
            return response.ResponseStream;
        }
        catch (AmazonS3Exception exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    /// <summary>S3 answers a delete of a missing key with success too.</summary>
    public async Task DeleteAsync(string name, CancellationToken cancellationToken) =>
        await _client.DeleteObjectAsync(_options.Bucket, KeyOf(name), cancellationToken);

    public void Dispose() => _client.Dispose();

    private string KeyOf(string name)
    {
        if (!StoredFileNames.IsValid(name))
        {
            throw new ArgumentException("Not a stored file name.", nameof(name));
        }

        return _options.KeyPrefix + name;
    }
}
