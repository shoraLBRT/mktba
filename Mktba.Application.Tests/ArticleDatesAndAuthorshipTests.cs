using AutoMapper;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Mappings;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;
using Mktba.Infrastructure.UnitOfWork;
using NSubstitute;

namespace Mktba.Application.Tests;

/// <summary>M-03 (#24): an article records when it was created, saved and first published, and who wrote it.</summary>
public class ArticleDatesAndAuthorshipTests : IDisposable
{
    private static readonly DateTime Start = new(2026, 11, 1, 9, 0, 0, DateTimeKind.Utc);

    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly FakeClock _clock = new(Start);
    private readonly ArticleService _articles;
    private readonly ArticleContentService _content;
    private readonly ArticleAuthorshipService _authorship;

    public ArticleDatesAndAuthorshipTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        var articleRepo = new ArticleRepository(_context);
        var mapper = new MapperConfiguration(cfg => cfg.AddProfile<MappingProfile>(), NullLoggerFactory.Instance).CreateMapper();
        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync().Returns(_ => _context.SaveChangesAsync());
        _articles = new ArticleService(articleRepo, mapper, _clock);
        _content = new ArticleContentService(articleRepo, new ParagraphRepository(_context), uow, new TagRepository(_context), _clock);
        _authorship = new ArticleAuthorshipService(articleRepo, new UserRepository(_context), _clock);
    }

    public void Dispose() => _context.Dispose();

    private async Task<int> AddUserAsync(string email)
    {
        var user = new User { Email = email, PasswordHash = "hash" };
        _context.Users.Add(user);
        await _context.SaveChangesAsync();
        return user.Id;
    }

    private Task<ArticleContentDto> CreateWithContentAsync(int? authorId) =>
        _content.CreateArticleWithContentAsync(new ArticleContentCreateDto(
            "Намаз",
            null,
            [new ParagraphCreateDto { Order = 1, Opinions = [new OpinionCreateDto("Text", true, [])] }],
            null,
            null,
            null,
            null), authorId);

    private async Task<Article> StoredAsync(int id)
    {
        _context.ChangeTracker.Clear();
        return (await _context.Articles.FindAsync(id))!;
    }

    [Fact]
    public async Task CreateAsync_GivenCreatingUser_StampsDatesAndAuthor()
    {
        var authorId = await AddUserAsync("author@mktba.ru");

        var created = await _articles.CreateAsync(new ArticleCreateDto { Title = "Намаз" }, authorId);

        created.CreatedAt.Should().Be(Start);
        created.UpdatedAt.Should().Be(Start);
        created.PublishedAt.Should().BeNull();
        created.AuthorId.Should().Be(authorId);
    }

    [Fact]
    public async Task CreateArticleWithContentAsync_GivenCreatingUser_StampsDatesAndAuthor()
    {
        var authorId = await AddUserAsync("author@mktba.ru");

        var created = await CreateWithContentAsync(authorId);

        var stored = await StoredAsync(created.Id);
        stored.CreatedAt.Should().Be(Start);
        stored.UpdatedAt.Should().Be(Start);
        stored.AuthorId.Should().Be(authorId);
        created.UpdatedAt.Should().Be(Start);
        created.PublishedAt.Should().BeNull();
    }

    [Fact]
    public async Task UpdateAsync_WhenTimePasses_MovesUpdatedAtAndKeepsCreatedAt()
    {
        var created = await _articles.CreateAsync(new ArticleCreateDto { Title = "Намаз" }, authorId: null);
        _clock.Advance(TimeSpan.FromHours(2));

        await _articles.UpdateAsync(created.Id, new ArticleUpdateDto { Title = "Намаз (молитва)" });

        var stored = await StoredAsync(created.Id);
        stored.CreatedAt.Should().Be(Start);
        stored.UpdatedAt.Should().Be(Start.AddHours(2));
    }

    [Fact]
    public async Task UpdateContentAsync_WhenTimePasses_MovesUpdatedAt()
    {
        var created = await CreateWithContentAsync(authorId: null);
        _clock.Advance(TimeSpan.FromDays(1));
        _context.ChangeTracker.Clear();
        foreach (var opinion in created.Paragraphs.SelectMany(paragraph => paragraph.Opinions))
        {
            opinion.Id = 0;
        }

        var (success, error) = await _content.UpdateContentAsync(created.Id, created with { Title = "Новое" }, authorId: null);

        success.Should().BeTrue(error?.Code);
        var content = await _content.GetContentByArticleIdAsync(created.Id, TestViewers.Admin);
        content.UpdatedAt.Should().Be(Start.AddDays(1));
    }

    [Fact]
    public async Task ChangeStatusAsync_OnFirstPublish_SetsPublishedAtWithoutTouchingUpdatedAt()
    {
        var created = await _articles.CreateAsync(new ArticleCreateDto { Title = "Намаз" }, authorId: null);
        await _articles.ChangeStatusAsync(created.Id, ArticleStatus.InReview, TestViewers.Admin);
        _clock.Advance(TimeSpan.FromHours(3));

        var published = await _articles.ChangeStatusAsync(created.Id, ArticleStatus.Published, TestViewers.Admin);

        published.PublishedAt.Should().Be(Start.AddHours(3));
        published.UpdatedAt.Should().Be(Start);
    }

    [Fact]
    public async Task ChangeStatusAsync_WhenArchivedAndPublishedAgain_KeepsTheFirstPublicationDate()
    {
        var created = await _articles.CreateAsync(new ArticleCreateDto { Title = "Намаз" }, authorId: null);
        await _articles.ChangeStatusAsync(created.Id, ArticleStatus.InReview, TestViewers.Admin);
        await _articles.ChangeStatusAsync(created.Id, ArticleStatus.Published, TestViewers.Admin);

        _clock.Advance(TimeSpan.FromDays(30));
        var archived = await _articles.ChangeStatusAsync(created.Id, ArticleStatus.Archived, TestViewers.Admin);
        archived.PublishedAt.Should().Be(Start);

        await _articles.ChangeStatusAsync(created.Id, ArticleStatus.Draft, TestViewers.Admin);
        await _articles.ChangeStatusAsync(created.Id, ArticleStatus.InReview, TestViewers.Admin);
        var republished = await _articles.ChangeStatusAsync(created.Id, ArticleStatus.Published, TestViewers.Admin);

        republished.PublishedAt.Should().Be(Start);
    }

    [Fact]
    public async Task SetAsync_GivenCoAuthors_StoresThemIgnoringDuplicatesAndMovesUpdatedAt()
    {
        var author = await AddUserAsync("author@mktba.ru");
        var first = await AddUserAsync("first@mktba.ru");
        var second = await AddUserAsync("second@mktba.ru");
        var created = await _articles.CreateAsync(new ArticleCreateDto { Title = "Намаз" }, author);
        _clock.Advance(TimeSpan.FromMinutes(5));

        var result = await _authorship.SetAsync(created.Id, new ArticleAuthorsDto { AuthorId = author, CoAuthorIds = [second, first, second] });

        result.AuthorId.Should().Be(author);
        result.CoAuthorIds.Should().Equal(first, second);
        (await StoredAsync(created.Id)).UpdatedAt.Should().Be(Start.AddMinutes(5));
        (await _authorship.GetAsync(created.Id)).CoAuthorIds.Should().Equal(first, second);
    }

    [Fact]
    public async Task SetAsync_GivenShorterList_RemovesDroppedCoAuthors()
    {
        var first = await AddUserAsync("first@mktba.ru");
        var second = await AddUserAsync("second@mktba.ru");
        var created = await _articles.CreateAsync(new ArticleCreateDto { Title = "Намаз" }, authorId: null);
        await _authorship.SetAsync(created.Id, new ArticleAuthorsDto { CoAuthorIds = [first, second] });
        _context.ChangeTracker.Clear();

        var result = await _authorship.SetAsync(created.Id, new ArticleAuthorsDto { CoAuthorIds = [second] });

        result.CoAuthorIds.Should().Equal(second);
        _context.ArticleCoAuthors.Count().Should().Be(1);
    }

    [Fact]
    public async Task SetAsync_GivenAuthorAmongCoAuthors_RejectsTheChange()
    {
        var author = await AddUserAsync("author@mktba.ru");
        var created = await _articles.CreateAsync(new ArticleCreateDto { Title = "Намаз" }, author);

        var act = () => _authorship.SetAsync(created.Id, new ArticleAuthorsDto { AuthorId = author, CoAuthorIds = [author] });

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("article_coauthor_is_author");
        _context.ArticleCoAuthors.Should().BeEmpty();
    }

    [Fact]
    public async Task SetAsync_GivenUnknownUser_RejectsTheChange()
    {
        var created = await _articles.CreateAsync(new ArticleCreateDto { Title = "Намаз" }, authorId: null);

        var act = () => _authorship.SetAsync(created.Id, new ArticleAuthorsDto { CoAuthorIds = [999] });

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("user_not_found");
    }

    [Fact]
    public async Task GetAsync_GivenMissingArticle_ThrowsNotFound()
    {
        var act = () => _authorship.GetAsync(999);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    private sealed class FakeClock(DateTime start) : TimeProvider
    {
        private DateTimeOffset _now = new(start);

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan by) => _now = _now.Add(by);
    }
}
