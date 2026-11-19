using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.Repositories;

public class SourceRepository : GenericRepository<Source>
{
    public SourceRepository(MktbaDbContext context) : base(context) { }

    /// <summary>
    /// Directory entries whose title or author contains <paramref name="text"/> (case-insensitive;
    /// null lists everything), optionally of one kind, by title.
    /// </summary>
    public Task<List<Source>> SearchAsync(string? text, SourceKind? kind, int limit, CancellationToken cancellationToken = default)
    {
        var query = _dbSet.AsNoTracking();
        if (kind is not null)
        {
            query = query.Where(s => s.Kind == kind);
        }

        if (text is not null)
        {
            var needle = text.ToLower();
            query = query.Where(s => s.Title.ToLower().Contains(needle) || (s.Author != null && s.Author.ToLower().Contains(needle)));
        }

        return query.OrderBy(s => s.Title).ThenBy(s => s.Id).Take(limit).ToListAsync(cancellationToken);
    }

    /// <summary>Another entry of the same kind with the same title and author, ignoring case.</summary>
    public Task<Source?> FindDuplicateAsync(SourceKind kind, string title, string? author, int? exceptId, CancellationToken cancellationToken = default)
    {
        var titleKey = title.ToLower();
        var authorKey = author?.ToLower();
        return _dbSet.AsNoTracking().FirstOrDefaultAsync(
            s => s.Kind == kind
                 && s.Id != exceptId
                 && s.Title.ToLower() == titleKey
                 && (authorKey == null ? s.Author == null : s.Author != null && s.Author.ToLower() == authorKey),
            cancellationToken);
    }

    /// <summary>How many citations (in the working copies of articles) point at the source.</summary>
    public Task<int> CountCitationsAsync(int sourceId, CancellationToken cancellationToken = default)
        => _context.OpinionSources.CountAsync(c => c.SourceId == sourceId, cancellationToken);
}
