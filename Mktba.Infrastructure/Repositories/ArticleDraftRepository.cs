using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.Repositories;

/// <summary>Autosaved drafts (E-02, #75): always one user's own, by article (null = the new-article page).</summary>
public class ArticleDraftRepository : GenericRepository<ArticleDraft>
{
    public ArticleDraftRepository(MktbaDbContext context) : base(context)
    {
    }

    /// <summary>The user's draft of the article (or of a new article), tracked; or null.</summary>
    public Task<ArticleDraft?> FindAsync(int userId, int? articleId, CancellationToken cancellationToken = default)
        => _dbSet.FirstOrDefaultAsync(draft => draft.UserId == userId && draft.ArticleId == articleId, cancellationToken);

    /// <summary>Marks the user's draft of the article (or of a new article) for removal, if there is one; the caller saves.</summary>
    public async Task RemoveAsync(int userId, int? articleId, CancellationToken cancellationToken = default)
    {
        var draft = await FindAsync(userId, articleId, cancellationToken);
        if (draft is not null)
        {
            _dbSet.Remove(draft);
        }
    }

    /// <summary>Stops tracking a draft whose insert failed, so it can be read again.</summary>
    public void Detach(ArticleDraft draft) => _context.Entry(draft).State = EntityState.Detached;

    /// <summary>Marks every draft last written before <paramref name="cutoff"/> for removal; the caller saves.</summary>
    public async Task<int> RemoveUpdatedBeforeAsync(DateTime cutoff, CancellationToken cancellationToken = default)
    {
        var stale = await _dbSet.Where(draft => draft.UpdatedAt < cutoff).ToListAsync(cancellationToken);
        _dbSet.RemoveRange(stale);
        return stale.Count;
    }
}
