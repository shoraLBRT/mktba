using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.Repositories
{
    /// <summary>
    /// Which articles count as «проверенные» (V-08, #124): the mark in search results and in the public
    /// lists, and the search's «только проверенные» filter.
    /// </summary>
    /// <remarks>
    /// Default chosen by the agent, open for the owner in #124. An article is verified when, among the
    /// newest marks of its verified scholars (the Scholar role and an approved application: the marks
    /// the public widget shows, V-04 #120), at least one current mark (V-05 #121: no substantial edit
    /// of the mark's scope since the reviewed revision) says «подтверждаю» or «подтверждаю с
    /// замечаниями» — for the whole article or for a madhab — and no current one says «есть ошибки».
    /// Stale marks count for nothing either way. A mark belongs to one article, which has one locale,
    /// so the rule is per locale by itself (#306). Written as one LINQ query EF translates to SQL, so it
    /// filters in the database; a missing fingerprint counts as a change, as on the widget.
    /// </remarks>
    public static class VerifiedArticles
    {
        /// <summary>The ids of the verified articles, of every status and locale: callers keep their own filters.</summary>
        public static IQueryable<int> Ids(MktbaDbContext db)
        {
            var current = CurrentMarks(db);
            return db.Articles
                .Where(article => current.Any(mark => mark.ArticleId == article.Id
                        && (mark.Verdict == ArticleReviewVerdict.Confirmed || mark.Verdict == ArticleReviewVerdict.ConfirmedWithRemarks))
                    && !current.Any(mark => mark.ArticleId == article.Id && mark.Verdict == ArticleReviewVerdict.HasErrors))
                .Select(article => article.Id);
        }

        /// <summary>
        /// Each verified scholar's newest mark of an article, kept only while it is current: it is about
        /// the article's latest revision, or that revision has the same fingerprint for the mark's scope.
        /// </summary>
        public static IQueryable<ArticleReview> CurrentMarks(MktbaDbContext db)
        {
            var wholeArticle = ArticleRevisionFingerprint.WholeArticle;
            return db.ArticleReviews
                .Where(review => review.Scholar.Role == UserRole.Scholar
                    && db.ScholarApplications.Any(application =>
                        application.UserId == review.ScholarId && application.Status == ScholarApplicationStatus.Approved)
                    && !db.ArticleReviews.Any(newer => newer.ArticleId == review.ArticleId
                        && newer.ScholarId == review.ScholarId
                        && newer.Revision.Number > review.Revision.Number)
                    && db.ArticleRevisions.Any(latest => latest.ArticleId == review.ArticleId
                        && !db.ArticleRevisions.Any(later => later.ArticleId == latest.ArticleId && later.Number > latest.Number)
                        && (latest.Id == review.RevisionId
                            || db.ArticleRevisionFingerprints.Any(reviewed => reviewed.RevisionId == review.RevisionId
                                && reviewed.Scope == (review.Mazhab ?? wholeArticle)
                                && db.ArticleRevisionFingerprints.Any(now => now.RevisionId == latest.Id
                                    && now.Scope == reviewed.Scope
                                    && now.Hash == reviewed.Hash)))));
        }

        /// <summary>The ids of the verified articles, loaded: the lists look their rows up in it.</summary>
        public static async Task<HashSet<int>> LoadIdsAsync(MktbaDbContext db, CancellationToken cancellationToken = default)
            => (await Ids(db).ToListAsync(cancellationToken)).ToHashSet();
    }
}
