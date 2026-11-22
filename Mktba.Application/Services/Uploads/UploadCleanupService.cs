using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Storage;

namespace Mktba.Application.Services.Uploads;

/// <summary>What one cleanup run did.</summary>
public sealed record UploadCleanupRun(int Checked, int Used, int Unused, int Deleted);

/// <summary>
/// Finds which uploaded files are still used and removes the ones nothing has used for a while
/// (U-08, #73). A file is looked at once it is older than the grace period
/// (<see cref="UploadCleanupOptions.UnusedDays"/>); a run that finds no reference to it marks it
/// <see cref="StoredFile.UnusedSince"/>, any later run that finds one clears the mark, and a file
/// still unreferenced a whole grace period after the mark is removed from the storage. Its
/// <see cref="StoredFile"/> row stays, with <see cref="StoredFile.DeletedAt"/> set.
/// </summary>
/// <remarks>
/// A reference is the file's name anywhere in a place that can hold a link (see
/// <see cref="StoredFileUsage"/>): avatars, the current content of articles, every saved revision
/// (a rollback can bring an old image back), autosaved drafts, profiles and sources. Files stored
/// before uploads were recorded have no row and are never removed.
/// </remarks>
public sealed class UploadCleanupService
{
    private readonly MktbaDbContext _db;
    private readonly IFileStorage _storage;
    private readonly TimeProvider _clock;
    private readonly UploadCleanupOptions _options;
    private readonly ILogger<UploadCleanupService> _logger;

    public UploadCleanupService(
        MktbaDbContext db,
        IFileStorage storage,
        TimeProvider clock,
        IOptions<UploadOptions> options,
        ILogger<UploadCleanupService> logger)
    {
        _db = db;
        _storage = storage;
        _clock = clock;
        _options = options.Value.Cleanup;
        _logger = logger;
    }

    public async Task<UploadCleanupRun> RunAsync(CancellationToken cancellationToken = default)
    {
        var now = _clock.GetUtcNow().UtcDateTime;
        var graceStart = now - _options.GracePeriod;

        var candidates = await _db.StoredFiles
            .Where(file => file.DeletedAt == null && file.UploadedAt <= graceStart)
            .ToListAsync(cancellationToken);
        if (candidates.Count == 0)
        {
            return new UploadCleanupRun(0, 0, 0, 0);
        }

        var usages = await FindUsagesAsync(candidates.Select(file => file.Name).ToHashSet(StringComparer.Ordinal), cancellationToken);

        int used = 0, unused = 0, deleted = 0;
        foreach (var file in candidates)
        {
            file.Usage = usages.GetValueOrDefault(file.Name);
            file.LastCheckedAt = now;
            if (file.Usage != StoredFileUsage.None)
            {
                file.UnusedSince = null;
                used++;
                continue;
            }

            unused++;
            file.UnusedSince ??= now;
            if (_options.DeleteUnused && file.UnusedSince <= graceStart)
            {
                // Removed first: should saving fail, the next run finds the row and removes again (a no-op).
                await _storage.DeleteAsync(file.Name, cancellationToken);
                file.DeletedAt = now;
                deleted++;
            }
        }

        await _db.SaveChangesAsync(cancellationToken);
        if (deleted > 0)
        {
            _logger.LogInformation("Removed {Count} uploaded file(s) nothing has used for {Days} days.", deleted, _options.UnusedDays);
        }

        return new UploadCleanupRun(candidates.Count, used, unused, deleted);
    }

    /// <summary>Where each of <paramref name="names"/> is referenced; a name used nowhere is absent.</summary>
    private async Task<Dictionary<string, StoredFileUsage>> FindUsagesAsync(HashSet<string> names, CancellationToken cancellationToken)
    {
        var usages = new Dictionary<string, StoredFileUsage>(StringComparer.Ordinal);

        async Task ScanAsync(IQueryable<string?> texts, StoredFileUsage usage)
        {
            await foreach (var text in texts.AsAsyncEnumerable().WithCancellation(cancellationToken))
            {
                foreach (var name in StoredFileNames.FindIn(text))
                {
                    if (names.Contains(name))
                    {
                        usages[name] = usages.GetValueOrDefault(name) | usage;
                    }
                }
            }
        }

        var users = _db.Users.AsNoTracking();
        // A trashed article can still be restored, so its files count as used until it is purged.
        var articles = _db.Articles.IgnoreQueryFilters().AsNoTracking();
        await ScanAsync(users.Where(user => user.AvatarUrl != null).Select(user => user.AvatarUrl), StoredFileUsage.Avatar);
        await ScanAsync(_db.Opinions.AsNoTracking().Select(opinion => (string?)opinion.Content), StoredFileUsage.Article);
        await ScanAsync(articles.Where(article => article.SocialImageUrl != null).Select(article => article.SocialImageUrl), StoredFileUsage.Article);
        await ScanAsync(articles.Where(article => article.Summary != null).Select(article => article.Summary), StoredFileUsage.Article);
        await ScanAsync(_db.ArticleInfoboxFields.AsNoTracking().Select(field => (string?)field.Value), StoredFileUsage.Article);
        await ScanAsync(_db.ArticleRevisions.AsNoTracking().Select(revision => (string?)revision.Snapshot), StoredFileUsage.Revision);
        await ScanAsync(_db.ArticleDrafts.AsNoTracking().Select(draft => (string?)draft.Snapshot), StoredFileUsage.Draft);
        await ScanAsync(users.Where(user => user.Bio != null).Select(user => user.Bio), StoredFileUsage.Other);
        await ScanAsync(_db.UserLinks.AsNoTracking().Select(link => (string?)link.Url), StoredFileUsage.Other);
        await ScanAsync(_db.Sources.AsNoTracking().Where(source => source.Url != null).Select(source => source.Url), StoredFileUsage.Other);
        return usages;
    }
}
