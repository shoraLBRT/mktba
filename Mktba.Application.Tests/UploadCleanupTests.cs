using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.Services.Uploads;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Storage;

namespace Mktba.Application.Tests;

/// <summary>U-08 (#73): which uploaded files count as used, and when an unused one is removed.</summary>
public sealed class UploadCleanupTests : IDisposable
{
    private static readonly DateTime Start = new(2026, 11, 22, 10, 0, 0, DateTimeKind.Utc);
    private static readonly TimeSpan Grace = TimeSpan.FromDays(30);

    private readonly string _root = Path.Combine(Path.GetTempPath(), $"mktba-cleanup-tests-{Guid.NewGuid():N}");
    private readonly MktbaDbContext _db = TestDbHelper.CreateInMemoryContext();
    private readonly FeedbackTests.FakeClock _clock = new(Start);
    private readonly LocalFileStorage _storage;

    public UploadCleanupTests()
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
    public async Task GivenUnreferencedFile_WhenUnusedForTheGracePeriodAfterItsOwn_ThenItIsRemovedAndTheRecordStays()
    {
        var name = await UploadAsync();

        _clock.Advance(Grace);
        var marked = await Service().RunAsync();
        marked.Should().Be(new UploadCleanupRun(Checked: 1, Used: 0, Unused: 1, Deleted: 0));
        (await RecordAsync(name)).UnusedSince.Should().Be(_clock.GetUtcNow().UtcDateTime);
        (await FileExistsAsync(name)).Should().BeTrue();

        _clock.Advance(Grace - TimeSpan.FromHours(1));
        (await Service().RunAsync()).Deleted.Should().Be(0);

        _clock.Advance(TimeSpan.FromHours(1));
        var removed = await Service().RunAsync();

        removed.Deleted.Should().Be(1);
        (await FileExistsAsync(name)).Should().BeFalse();
        var record = await RecordAsync(name);
        record.DeletedAt.Should().Be(_clock.GetUtcNow().UtcDateTime);
        record.Usage.Should().Be(StoredFileUsage.None);

        (await Service().RunAsync()).Checked.Should().Be(0, "a removed file is not looked at again");
    }

    [Fact]
    public async Task GivenFreshUpload_WhenCleanupRuns_ThenItIsNotLookedAt()
    {
        var name = await UploadAsync();
        _clock.Advance(Grace - TimeSpan.FromMinutes(1));

        (await Service().RunAsync()).Checked.Should().Be(0);
        (await RecordAsync(name)).LastCheckedAt.Should().BeNull();
    }

    [Fact]
    public async Task GivenFileReferencedEverywhere_WhenCleanupRuns_ThenEachPlaceIsRecordedAndNothingIsRemoved()
    {
        var avatar = await UploadAsync();
        var inText = await UploadAsync();
        var inRevision = await UploadAsync();
        var inDraft = await UploadAsync();
        var inBio = await UploadAsync();
        var social = await UploadAsync();

        var user = new User { Email = "a@example.org", AvatarUrl = Url(avatar), Bio = "Мой график: " + Url(inBio) };
        var article = new Article { Title = "Статья", Slug = "statya", SocialImageUrl = "/files/" + social, Author = user };
        article.Paragraphs.Add(new Paragraph { Order = 10, Opinions = { new Opinion { Content = $"Текст ![схема]({Url(inText)})", IsDefault = true } } });
        article.Revisions.Add(new ArticleRevision { Number = 1, Snapshot = $"{{\"text\":\"![a]({Url(inRevision)})\"}}" });
        _db.Users.Add(user);
        _db.Articles.Add(article);
        _db.ArticleDrafts.Add(new ArticleDraft { User = user, Snapshot = $"{{\"draft\":\"{Url(inDraft)}\"}}" });
        await _db.SaveChangesAsync();

        for (var run = 0; run < 3; run++)
        {
            _clock.Advance(Grace);
            (await Service().RunAsync()).Should().Be(new UploadCleanupRun(Checked: 6, Used: 6, Unused: 0, Deleted: 0));
        }

        (await RecordAsync(avatar)).Usage.Should().Be(StoredFileUsage.Avatar);
        (await RecordAsync(inText)).Usage.Should().Be(StoredFileUsage.Article);
        (await RecordAsync(social)).Usage.Should().Be(StoredFileUsage.Article);
        (await RecordAsync(inRevision)).Usage.Should().Be(StoredFileUsage.Revision);
        (await RecordAsync(inDraft)).Usage.Should().Be(StoredFileUsage.Draft);
        (await RecordAsync(inBio)).Usage.Should().Be(StoredFileUsage.Other);
        foreach (var name in new[] { avatar, inText, inRevision, inDraft, inBio, social })
        {
            (await FileExistsAsync(name)).Should().BeTrue();
            (await RecordAsync(name)).UnusedSince.Should().BeNull();
        }
    }

    [Fact]
    public async Task GivenFilesOfATrashedArticle_WhenCleanupRuns_ThenTheyCountAsUsedUntilThePurge()
    {
        var social = await UploadAsync();
        var inSummary = await UploadAsync();
        var inText = await UploadAsync();
        var article = new Article
        {
            Title = "В корзине",
            Slug = "v-korzine",
            SocialImageUrl = Url(social),
            Summary = "Схема: " + Url(inSummary),
            DeletedAt = Start,
        };
        article.Paragraphs.Add(new Paragraph { Order = 1, Opinions = { new Opinion { Content = $"![a]({Url(inText)})", IsDefault = true } } });
        _db.Articles.Add(article);
        await _db.SaveChangesAsync();

        for (var run = 0; run < 3; run++)
        {
            _clock.Advance(Grace);
            (await Service().RunAsync()).Should().Be(new UploadCleanupRun(Checked: 3, Used: 3, Unused: 0, Deleted: 0));
        }

        foreach (var name in new[] { social, inSummary, inText })
        {
            (await RecordAsync(name)).Usage.Should().Be(StoredFileUsage.Article);
            (await FileExistsAsync(name)).Should().BeTrue();
        }
    }

    [Fact]
    public async Task GivenUnusedFileThatIsUsedAgain_WhenCleanupRuns_ThenTheMarkIsClearedAndTheGraceStartsOver()
    {
        var name = await UploadAsync();
        _clock.Advance(Grace);
        await Service().RunAsync();
        (await RecordAsync(name)).UnusedSince.Should().NotBeNull();

        var user = new User { Email = "b@example.org", AvatarUrl = Url(name) };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        _clock.Advance(Grace);
        await Service().RunAsync();
        (await RecordAsync(name)).UnusedSince.Should().BeNull();

        user.AvatarUrl = null;
        await _db.SaveChangesAsync();
        _clock.Advance(TimeSpan.FromDays(1));
        (await Service().RunAsync()).Deleted.Should().Be(0, "the file has only just become unused");
        (await FileExistsAsync(name)).Should().BeTrue();
    }

    [Fact]
    public async Task GivenDeletingTurnedOff_WhenAFileIsLongUnused_ThenItIsOnlyMarked()
    {
        var name = await UploadAsync();

        for (var run = 0; run < 3; run++)
        {
            _clock.Advance(Grace);
            (await Service(deleteUnused: false).RunAsync()).Deleted.Should().Be(0);
        }

        (await FileExistsAsync(name)).Should().BeTrue();
        var record = await RecordAsync(name);
        record.UnusedSince.Should().Be(Start + Grace);
        record.DeletedAt.Should().BeNull();
    }

    private UploadCleanupService Service(bool deleteUnused = true) => new(
        _db,
        _storage,
        _clock,
        Options.Create(new UploadOptions { Cleanup = new UploadCleanupOptions { DeleteUnused = deleteUnused, UnusedDays = (int)Grace.TotalDays } }),
        NullLogger<UploadCleanupService>.Instance);

    private async Task<string> UploadAsync()
    {
        var upload = new ImageUploadService(_storage, _db, _clock, Options.Create(new UploadOptions()));
        var png = ImageUploadTests.Encode(16, 16, SkiaSharp.SKEncodedImageFormat.Png);
        return (await upload.UploadAsync(new MemoryStream(png), ImageUploadPurpose.ArticleImage, uploadedById: null, default)).Name;
    }

    private Task<StoredFile> RecordAsync(string name) =>
        _db.StoredFiles.AsNoTracking().SingleAsync(file => file.Name == name);

    private async Task<bool> FileExistsAsync(string name)
    {
        await using var stream = await _storage.OpenReadAsync(name, default);
        return stream is not null;
    }

    private static string Url(string name) => "https://api.mktba.ru/files/" + name;
}
