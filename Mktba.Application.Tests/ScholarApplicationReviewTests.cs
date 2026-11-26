using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Application.Services.Verification;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;
using Mktba.Infrastructure.Storage;

namespace Mktba.Application.Tests;

/// <summary>V-02 (#118): the admin's list, approval, refusal and revocation of scholar applications.</summary>
public sealed class ScholarApplicationReviewTests : IDisposable
{
    private static readonly DateTime Now = new(2026, 11, 26, 10, 0, 0, DateTimeKind.Utc);

    private readonly string _root = Path.Combine(Path.GetTempPath(), $"mktba-scholar-review-tests-{Guid.NewGuid():N}");
    private readonly MktbaDbContext _db = TestDbHelper.CreateInMemoryContext();
    private readonly FeedbackTests.FakeClock _clock = new(Now);
    private readonly LocalFileStorage _storage;

    public ScholarApplicationReviewTests()
    {
        _storage = new LocalFileStorage(_root);
    }

    public void Dispose()
    {
        _db.Dispose();
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    [Fact]
    public async Task GivenApplicationsOfSeveralStatuses_WhenListed_ThenTheyComeNewestFirstFilteredAndPaged()
    {
        var first = await ApplyAsync(UserRole.Reader);
        _clock.Advance(TimeSpan.FromMinutes(1));
        var second = await ApplyAsync(UserRole.Author);
        _clock.Advance(TimeSpan.FromMinutes(1));
        var third = await ApplyAsync(UserRole.Reader);
        await Applications().WithdrawAsync(third.UserId, default);

        var all = await Review().ListAsync(null, 1, 20, default);
        all.Items.Select(item => item.Id).Should().Equal(third.Id, second.Id, first.Id);
        all.Total.Should().Be(3);
        all.Items[1].DocumentCount.Should().Be(1);
        all.Items[1].Applicant.Role.Should().Be(UserRole.Author);

        var pending = await Review().ListAsync(ScholarApplicationStatus.Pending, 1, 1, default);
        pending.Items.Select(item => item.Id).Should().Equal(second.Id);
        (pending.Total, pending.Page, pending.PageSize).Should().Be((2, 1, 1));

        var clamped = await Review().ListAsync(null, 0, 1000, default);
        (clamped.Page, clamped.PageSize).Should().Be((1, ScholarApplicationReviewService.MaxPageSize));
    }

    [Fact]
    public async Task GivenPendingApplication_WhenApproved_ThenTheApplicantIsAScholarTheDocumentsStayAndTheLogHasBothEntries()
    {
        var adminId = await UserAsync(UserRole.Admin);
        var applied = await ApplyAsync(UserRole.Author);

        var review = await Review().ApproveAsync(applied.Id, adminId, default);

        review.Application.Status.Should().Be(ScholarApplicationStatus.Approved);
        review.Application.ClosedAt.Should().Be(Now);
        review.Application.Documents.Should().HaveCount(1);
        review.Applicant.Role.Should().Be(UserRole.Scholar);
        (review.CanApprove, review.CanReject, review.CanRevoke).Should().Be((false, false, true));
        (await _db.Users.AsNoTracking().SingleAsync(user => user.Id == applied.UserId)).Role.Should().Be(UserRole.Scholar);
        (await _db.ScholarApplications.AsNoTracking().SingleAsync()).RoleBeforeApproval.Should().Be(UserRole.Author);
        var entries = await _db.AuditLogEntries.AsNoTracking().OrderBy(entry => entry.Id).ToListAsync();
        entries.Select(entry => (entry.Action, entry.ActorId, entry.TargetUserId)).Should().BeEquivalentTo(new[]
        {
            (AuditAction.ScholarApplicationApproved, (int?)adminId, (int?)applied.UserId),
            (AuditAction.UserRoleChanged, (int?)adminId, (int?)applied.UserId),
        });
        entries.Single(entry => entry.Action == AuditAction.UserRoleChanged).ToValue.Should().Be("Scholar");
    }

    [Fact]
    public async Task GivenApplicantWhoseRoleChangedMeanwhile_WhenApproved_ThenItIsRefusedAndNothingChanges()
    {
        var adminId = await UserAsync(UserRole.Admin);
        var applied = await ApplyAsync(UserRole.Reader);
        var user = await _db.Users.SingleAsync(candidate => candidate.Id == applied.UserId);
        user.Role = UserRole.Admin;
        await _db.SaveChangesAsync();

        var act = () => Review().ApproveAsync(applied.Id, adminId, default);

        (await act.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("scholar_applicant_role_changed");
        (await Review().GetAsync(applied.Id, default)).Application.Status.Should().Be(ScholarApplicationStatus.Pending);
        (await _db.AuditLogEntries.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task GivenPendingApplication_WhenRejectedWithAReason_ThenTheApplicantSeesItTheDocumentsAreGoneAndTheyMayApplyAgain()
    {
        var adminId = await UserAsync(UserRole.Admin);
        var applied = await ApplyAsync(UserRole.Reader);
        var fileName = (await _db.StoredFiles.AsNoTracking().SingleAsync()).Name;

        var review = await Review().RejectAsync(applied.Id, "  Документ нечитаем.\r\nПриложите скан получше.  ", adminId, default);

        review.Application.Status.Should().Be(ScholarApplicationStatus.Rejected);
        review.Application.DecisionReason.Should().Be("Документ нечитаем.\nПриложите скан получше.");
        review.Application.Documents.Should().BeEmpty();
        (await _storage.OpenReadAsync(fileName, default)).Should().BeNull();
        (await _db.StoredFiles.AsNoTracking().SingleAsync()).DeletedAt.Should().Be(Now);
        (await _db.Users.AsNoTracking().SingleAsync(user => user.Id == applied.UserId)).Role.Should().Be(UserRole.Reader);
        (await _db.AuditLogEntries.AsNoTracking().SingleAsync()).Action.Should().Be(AuditAction.ScholarApplicationRejected);

        var mine = await Applications().GetMineAsync(applied.UserId, default);
        mine.CanApply.Should().BeTrue();
        mine.Application!.DecisionReason.Should().Be("Документ нечитаем.\nПриложите скан получше.");
    }

    [Theory]
    [InlineData(null, "scholar_decision_reason_required")]
    [InlineData("   ", "scholar_decision_reason_required")]
    public async Task GivenNoReason_WhenRejected_ThenItIsRefused(string? reason, string code)
    {
        var adminId = await UserAsync(UserRole.Admin);
        var applied = await ApplyAsync(UserRole.Reader);

        var act = () => Review().RejectAsync(applied.Id, reason, adminId, default);

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be(code);
    }

    [Fact]
    public async Task GivenTooLongReason_WhenRejected_ThenItIsRefusedWithTheLimit()
    {
        var adminId = await UserAsync(UserRole.Admin);
        var applied = await ApplyAsync(UserRole.Reader);

        var act = () => Review().RejectAsync(applied.Id, new string('я', ScholarApplication.ReasonMaxLength + 1), adminId, default);

        var error = (await act.Should().ThrowAsync<ValidationException>()).Which.Error;
        error.Code.Should().Be("scholar_decision_reason_too_long");
        error.Params!["maxLength"].Should().Be(ScholarApplication.ReasonMaxLength);
    }

    [Fact]
    public async Task GivenDecidedOrWithdrawnApplication_WhenDecidedAgain_ThenItIsNotPending()
    {
        var adminId = await UserAsync(UserRole.Admin);
        var withdrawn = await ApplyAsync(UserRole.Reader);
        await Applications().WithdrawAsync(withdrawn.UserId, default);
        var approved = await ApplyAsync(UserRole.Reader);
        await Review().ApproveAsync(approved.Id, adminId, default);

        foreach (var id in new[] { withdrawn.Id, approved.Id })
        {
            var approve = () => Review().ApproveAsync(id, adminId, default);
            (await approve.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("scholar_application_not_pending");
            var reject = () => Review().RejectAsync(id, "Нет", adminId, default);
            (await reject.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("scholar_application_not_pending");
        }

        var missing = () => Review().GetAsync(9999, default);
        (await missing.Should().ThrowAsync<NotFoundException>()).Which.Error.Code.Should().Be("scholar_application_not_found");
    }

    [Fact]
    public async Task GivenApprovedApplication_WhenRevoked_ThenThePreviousRoleIsBackTheDocumentsAreGoneAndTheUserMayApplyAgain()
    {
        var adminId = await UserAsync(UserRole.Admin);
        var applied = await ApplyAsync(UserRole.Author);
        await Review().ApproveAsync(applied.Id, adminId, default);
        _clock.Advance(TimeSpan.FromDays(3));

        var review = await Review().RevokeAsync(applied.Id, "Степень не подтвердилась.", adminId, default);

        review.Application.Status.Should().Be(ScholarApplicationStatus.Revoked);
        review.Application.RevokedAt.Should().Be(Now.AddDays(3));
        review.Application.DecisionReason.Should().Be("Степень не подтвердилась.");
        review.Application.Documents.Should().BeEmpty();
        review.Applicant.Role.Should().Be(UserRole.Author);
        (review.CanApprove, review.CanReject, review.CanRevoke).Should().Be((false, false, false));
        (await _db.AuditLogEntries.AsNoTracking().OrderBy(entry => entry.Id).Select(entry => entry.Action).ToListAsync())
            .Should().Contain(AuditAction.ScholarStatusRevoked);
        (await _db.AuditLogEntries.AsNoTracking().CountAsync(entry => entry.Action == AuditAction.UserRoleChanged && entry.ToValue == "Author"))
            .Should().Be(1);
        (await Applications().GetMineAsync(applied.UserId, default)).CanApply.Should().BeTrue();
    }

    [Fact]
    public async Task GivenApplicationThatIsNotApprovedOrUserNoLongerScholar_WhenRevoked_ThenItIsRefused()
    {
        var adminId = await UserAsync(UserRole.Admin);
        var pending = await ApplyAsync(UserRole.Reader);
        var approved = await ApplyAsync(UserRole.Reader);
        await Review().ApproveAsync(approved.Id, adminId, default);
        await new UserAdminService(new UserRepository(_db), new AuditLogRepository(_db), _clock)
            .ChangeRoleAsync(approved.UserId, UserRole.Reader, adminId);

        var notApproved = () => Review().RevokeAsync(pending.Id, "Причина", adminId, default);
        (await notApproved.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("scholar_application_not_approved");
        var noLongerScholar = () => Review().RevokeAsync(approved.Id, "Причина", adminId, default);
        (await noLongerScholar.Should().ThrowAsync<ConflictException>()).Which.Error.Code.Should().Be("scholar_applicant_role_changed");
        (await Review().GetAsync(approved.Id, default)).CanRevoke.Should().BeFalse();
    }

    private ScholarApplicationService Applications() => new(_db, _storage, _clock, Options.Create(new UploadOptions()));

    private ScholarApplicationReviewService Review() => new(
        _db, _storage, _clock, new UserAdminService(new UserRepository(_db), new AuditLogRepository(_db), _clock), new AuditLogRepository(_db));

    private async Task<(int Id, int UserId)> ApplyAsync(UserRole role)
    {
        var userId = await UserAsync(role);
        var application = await Applications().SubmitAsync(
            userId,
            new ScholarApplicationInput("Магистр", "Институт", "Фикх", null),
            [new ScholarDocumentUpload("диплом.pdf", new MemoryStream(ScholarApplicationTests.Pdf()))],
            default);
        return (application.Id, userId);
    }

    private async Task<int> UserAsync(UserRole role)
    {
        var user = new User { Email = $"{Guid.NewGuid():N}@mktba.test", Role = role };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user.Id;
    }
}
