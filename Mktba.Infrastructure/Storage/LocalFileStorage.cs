namespace Mktba.Infrastructure.Storage;

/// <summary>
/// Keeps files in one directory on the API's machine: Development, tests, and a single-server
/// deployment whose directory is on a persistent volume. A file is written to a temporary name
/// first and moved into place, so a reader never sees half of it.
/// </summary>
public sealed class LocalFileStorage : IFileStorage
{
    private readonly string _rootPath;

    public LocalFileStorage(string rootPath)
    {
        _rootPath = Path.GetFullPath(rootPath);
    }

    public async Task SaveAsync(string name, ReadOnlyMemory<byte> content, string contentType, CancellationToken cancellationToken)
    {
        var path = PathOf(name);
        Directory.CreateDirectory(_rootPath);
        var temporaryPath = path + ".tmp-" + Guid.NewGuid().ToString("N");
        try
        {
            await using (var stream = new FileStream(temporaryPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                await stream.WriteAsync(content, cancellationToken);
            }

            File.Move(temporaryPath, path, overwrite: false);
        }
        finally
        {
            File.Delete(temporaryPath);
        }
    }

    public Task<Stream?> OpenReadAsync(string name, CancellationToken cancellationToken)
    {
        var path = PathOf(name);
        Stream? stream = File.Exists(path)
            ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, bufferSize: 81920, useAsync: true)
            : null;
        return Task.FromResult(stream);
    }

    public Task DeleteAsync(string name, CancellationToken cancellationToken)
    {
        File.Delete(PathOf(name));
        return Task.CompletedTask;
    }

    private string PathOf(string name)
    {
        if (!StoredFileNames.IsValid(name))
        {
            throw new ArgumentException("Not a stored file name.", nameof(name));
        }

        return Path.Combine(_rootPath, name);
    }
}
