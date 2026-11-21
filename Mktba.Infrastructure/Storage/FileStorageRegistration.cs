using Microsoft.Extensions.DependencyInjection;

namespace Mktba.Infrastructure.Storage;

public static class FileStorageRegistration
{
    /// <summary>Registers the <see cref="IFileStorage"/> that <paramref name="options"/> name (one instance for the app).</summary>
    /// <param name="contentRootPath">What a relative <c>Storage:Local:RootPath</c> is taken from.</param>
    public static IServiceCollection AddFileStorage(this IServiceCollection services, FileStorageOptions options, string contentRootPath)
    {
        if (string.Equals(options.Provider, FileStorageOptions.S3Provider, StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IFileStorage>(_ => new S3FileStorage(options.S3));
        }
        else if (string.Equals(options.Provider, FileStorageOptions.LocalProvider, StringComparison.OrdinalIgnoreCase))
        {
            var rootPath = Path.Combine(contentRootPath, options.Local.RootPath);
            services.AddSingleton<IFileStorage>(_ => new LocalFileStorage(rootPath));
        }
        else
        {
            throw new InvalidOperationException(
                $"Storage:Provider must be '{FileStorageOptions.LocalProvider}' or '{FileStorageOptions.S3Provider}'.");
        }

        return services;
    }
}
