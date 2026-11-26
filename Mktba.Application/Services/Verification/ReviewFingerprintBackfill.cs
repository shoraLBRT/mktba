using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Application.Services.Verification;

/// <summary>
/// Gives every revision its fingerprints (V-05, #121): those written before V-05, and those that miss
/// the scope of a canonical school added since. Runs before the API serves, after the migrations and
/// the seed; with nothing to do it costs one query. Kept in code, not in the migration, because the
/// hash is the C# normalization of the snapshot, which SQL would have to repeat exactly.
/// </summary>
public static class ReviewFingerprintBackfill
{
    private const int BatchSize = 200;

    /// <summary>Adds the missing fingerprints; returns how many revisions got some.</summary>
    public static async Task<int> RunAsync(MktbaDbContext db, CancellationToken cancellationToken = default)
    {
        var schools = await db.Schools.AsNoTracking()
            .Where(school => school.IsSystem)
            .OrderBy(school => school.Id)
            .Select(school => new ReviewScopeSchool(school.Slug, school.Id))
            .ToListAsync(cancellationToken);
        var scopeCount = schools.Count + 1;
        var filled = 0;
        var afterId = 0;
        while (true)
        {
            var batch = await db.ArticleRevisions
                .Where(revision => revision.Id > afterId && revision.Fingerprints.Count < scopeCount)
                .OrderBy(revision => revision.Id)
                .Take(BatchSize)
                .Select(revision => new
                {
                    revision.Id,
                    revision.Snapshot,
                    Scopes = revision.Fingerprints.Select(fingerprint => fingerprint.Scope).ToList(),
                })
                .ToListAsync(cancellationToken);
            if (batch.Count == 0)
            {
                return filled;
            }

            foreach (var revision in batch)
            {
                var snapshot = ArticleSnapshots.Deserialize(revision.Snapshot);
                var missing = ReviewFingerprints.For(snapshot, schools)
                    .Where(fingerprint => !revision.Scopes.Contains(fingerprint.Scope));
                foreach (var fingerprint in missing)
                {
                    fingerprint.RevisionId = revision.Id;
                    db.ArticleRevisionFingerprints.Add(fingerprint);
                }
            }

            await db.SaveChangesAsync(cancellationToken);
            db.ChangeTracker.Clear();
            filled += batch.Count;
            afterId = batch[^1].Id;
        }
    }
}
