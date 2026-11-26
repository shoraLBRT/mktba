using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Application.Tests;

internal static class TestDbHelper
{
    public static MktbaDbContext CreateInMemoryContext()
    {
        var options = new DbContextOptionsBuilder<MktbaDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        var context = new MktbaDbContext(options);
        context.Database.EnsureCreated();
        return context;
    }

    /// <summary>
    /// Makes the article count as verified (V-08, #124): a verified scholar confirms its only revision.
    /// </summary>
    public static async Task ConfirmByScholarAsync(MktbaDbContext context, int articleId)
    {
        var now = new DateTime(2026, 11, 26, 0, 0, 0, DateTimeKind.Utc);
        var scholar = new User { Email = $"{Guid.NewGuid():N}@mktba.test", Role = UserRole.Scholar };
        context.Users.Add(scholar);
        await context.SaveChangesAsync();
        context.ScholarApplications.Add(new ScholarApplication
        {
            UserId = scholar.Id, Degree = "Доктор наук", Institution = "Университет", Specialization = "Фикх",
            Status = ScholarApplicationStatus.Approved, SubmittedAt = now, ClosedAt = now, RoleBeforeApproval = UserRole.Reader,
        });
        var revision = new ArticleRevision { ArticleId = articleId, Number = 1, CreatedAt = now, Snapshot = "{}" };
        context.ArticleRevisions.Add(revision);
        context.ArticleReviews.Add(new ArticleReview
        {
            ArticleId = articleId, Revision = revision, ScholarId = scholar.Id, Verdict = ArticleReviewVerdict.Confirmed,
            CreatedAt = now, UpdatedAt = now,
        });
        await context.SaveChangesAsync();
    }
}
