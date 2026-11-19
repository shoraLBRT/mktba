using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.Repositories;

public class UserRepository : GenericRepository<User>
{
    public UserRepository(MktbaDbContext context) : base(context)
    {
    }

    public Task<bool> AnyAsync(CancellationToken cancellationToken = default)
        => _dbSet.AnyAsync(cancellationToken);

    public Task<bool> ExistsByEmailAsync(string email, CancellationToken cancellationToken = default)
        => _dbSet.AnyAsync(user => user.Email == email, cancellationToken);

    public Task<User?> GetByEmailAsync(string email, CancellationToken cancellationToken = default)
        => _dbSet.FirstOrDefaultAsync(user => user.Email == email, cancellationToken);

    /// <summary>The user with <paramref name="id"/>, read-only, or null.</summary>
    public Task<User?> FindReadOnlyAsync(int id, CancellationToken cancellationToken = default)
        => _dbSet.AsNoTracking().FirstOrDefaultAsync(user => user.Id == id, cancellationToken);

    /// <summary>
    /// The current role of the user with <paramref name="id"/> while their device session
    /// <paramref name="sessionFamilyId"/> still has a live refresh token; null when there is no such
    /// user or the session has ended (signed out, revoked or expired).
    /// </summary>
    public Task<UserRole?> GetRoleInActiveSessionAsync(
        int id,
        Guid sessionFamilyId,
        DateTime nowUtc,
        CancellationToken cancellationToken = default)
        => _dbSet
            .Where(user => user.Id == id && _context.RefreshSessions.Any(session =>
                session.UserId == id
                && session.FamilyId == sessionFamilyId
                && session.RevokedAtUtc == null
                && session.ExpiresAtUtc > nowUtc))
            .Select(user => (UserRole?)user.Role)
            .FirstOrDefaultAsync(cancellationToken);

    /// <summary>The user with <paramref name="id"/> and their profile links, tracked, or null.</summary>
    public Task<User?> FindWithLinksAsync(int id, CancellationToken cancellationToken = default)
        => _dbSet.Include(user => user.Links).FirstOrDefaultAsync(user => user.Id == id, cancellationToken);

    /// <summary>The user with <paramref name="id"/> and their profile links, read-only, or null.</summary>
    public Task<User?> FindWithLinksReadOnlyAsync(int id, CancellationToken cancellationToken = default)
        => _dbSet.AsNoTracking().Include(user => user.Links).FirstOrDefaultAsync(user => user.Id == id, cancellationToken);

    /// <summary>Whether a user other than <paramref name="exceptUserId"/> has the profile slug <paramref name="slug"/>.</summary>
    public Task<bool> IsSlugTakenAsync(string slug, int exceptUserId, CancellationToken cancellationToken = default)
        => _dbSet.AnyAsync(user => user.Slug == slug && user.Id != exceptUserId, cancellationToken);

    /// <summary>
    /// Whether the user is the author or a co-author of at least one Published article: the rule that
    /// makes a profile with a display name public.
    /// </summary>
    public Task<bool> IsCreditedOnPublishedArticleAsync(int userId, CancellationToken cancellationToken = default)
        => CreditedOnPublishedArticle().AnyAsync(user => user.Id == userId, cancellationToken);

    /// <summary>
    /// The user whose public profile lives at <paramref name="slug"/>, with links, read-only; null when
    /// there is no such slug or the user is not credited on a Published article.
    /// </summary>
    public Task<User?> FindPublicBySlugAsync(string slug, CancellationToken cancellationToken = default)
        => CreditedOnPublishedArticle()
            .AsNoTracking()
            .Include(user => user.Links)
            .FirstOrDefaultAsync(user => user.Slug == slug && user.DisplayName != null, cancellationToken);

    private IQueryable<User> CreditedOnPublishedArticle()
        => _dbSet.Where(user => _context.Articles.Any(article =>
            article.Status == ArticleStatus.Published
            && (article.AuthorId == user.Id || article.CoAuthors.Any(coAuthor => coAuthor.UserId == user.Id))));

    /// <summary>How many users have <paramref name="role"/>.</summary>
    public Task<int> CountByRoleAsync(UserRole role, CancellationToken cancellationToken = default)
        => _dbSet.CountAsync(user => user.Role == role, cancellationToken);

    /// <summary>All users ordered by email, read-only.</summary>
    public Task<List<User>> ListOrderedByEmailAsync(CancellationToken cancellationToken = default)
        => _dbSet.AsNoTracking().OrderBy(user => user.Email).ToListAsync(cancellationToken);

    /// <summary>Which of <paramref name="ids"/> belong to existing users.</summary>
    public Task<List<int>> FindExistingIdsAsync(IReadOnlyCollection<int> ids, CancellationToken cancellationToken = default)
        => _dbSet.Where(user => ids.Contains(user.Id)).Select(user => user.Id).ToListAsync(cancellationToken);
}
