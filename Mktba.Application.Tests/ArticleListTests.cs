using AutoMapper;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Mktba.Application.Mappings;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>A-02 (#34): the admin article list — filters, sorting, paging bounds and who sees what.</summary>
public class ArticleListTests : IDisposable
{
    private static readonly DateTime Start = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private readonly Infrastructure.Data.MktbaDbContext _context;
    private readonly ArticleService _articles;

    public ArticleListTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        var mapper = new MapperConfiguration(cfg => cfg.AddProfile<MappingProfile>(), NullLoggerFactory.Instance).CreateMapper();
        _articles = new ArticleService(new ArticleRepository(_context), mapper, TimeProvider.System, new RecordingSearchEngineNotifier(), new AuditLogRepository(_context));
    }

    public void Dispose() => _context.Dispose();

    private Article Add(
        string title,
        ArticleStatus status = ArticleStatus.Draft,
        int? authorId = null,
        string? tags = null,
        string locale = "ru",
        int updatedDay = 0,
        int? publishedDay = null,
        int paragraphs = 0,
        int? coAuthorId = null)
    {
        var article = new Article
        {
            Title = title,
            Slug = title.ToLowerInvariant().Replace(' ', '-'),
            Locale = locale,
            Status = status,
            AuthorId = authorId,
            TagsSearchText = tags,
            CreatedAt = Start,
            UpdatedAt = Start.AddDays(updatedDay),
            PublishedAt = publishedDay is int day ? Start.AddDays(day) : null,
        };
        for (var order = 1; order <= paragraphs; order++)
        {
            article.Paragraphs.Add(new Paragraph { Order = order });
        }

        var names = tags?.Split(',') ?? [];
        for (var order = 0; order < names.Length; order++)
        {
            var key = TagRules.KeyOf(names[order]);
            var tag = _context.Tags.Local.FirstOrDefault(t => t.Locale == locale && t.NormalizedName == key)
                ?? new Tag { Locale = locale, Name = names[order], NormalizedName = key, Slug = TagRules.SlugFromName(names[order]) };
            article.TagLinks.Add(new ArticleTag { Tag = tag, Order = order });
        }

        if (coAuthorId is int coAuthor)
        {
            article.CoAuthors.Add(new ArticleCoAuthor { UserId = coAuthor });
        }

        _context.Articles.Add(article);
        _context.SaveChanges();
        return article;
    }

    private static ArticleListQuery Query(
        string? search = null,
        ArticleStatus? status = null,
        int? authorId = null,
        string? tag = null,
        string? locale = null,
        ArticleListSort sort = ArticleListSort.UpdatedAt,
        SortDirection direction = SortDirection.Desc,
        int page = 1,
        int pageSize = 20) =>
        new(search, status, authorId, tag, locale, sort, direction, page, pageSize);

    private async Task<List<string>> TitlesAsync(ArticleListQuery query, ArticleViewer? viewer = null) =>
        (await _articles.GetListAsync(query, viewer ?? TestViewers.Admin)).Items.Select(item => item.Title).ToList();

    [Fact]
    public async Task GivenArticles_WhenSearchingTitleOrSlug_ThenMatchesCaseInsensitively()
    {
        Add("Намаз путника");
        Add("Пост");
        var bySlug = Add("Закят");
        bySlug.Slug = "zakat-imushchestva";
        _context.SaveChanges();

        (await TitlesAsync(Query(search: "НАМАЗ"))).Should().Equal("Намаз путника");
        (await TitlesAsync(Query(search: "imushch"))).Should().Equal("Закят");
    }

    [Fact]
    public async Task GivenArticles_WhenFilteringByStatusAuthorAndLocale_ThenOnlyMatchesRemain()
    {
        Add("Черновик", ArticleStatus.Draft, authorId: 1);
        Add("Опубликованная", ArticleStatus.Published, authorId: 1);
        Add("Чужая", ArticleStatus.Published, authorId: 2);
        Add("Английская", ArticleStatus.Published, authorId: 2, locale: "en");

        (await TitlesAsync(Query(status: ArticleStatus.Published, sort: ArticleListSort.Title, direction: SortDirection.Asc)))
            .Should().Equal("Английская", "Опубликованная", "Чужая");
        (await TitlesAsync(Query(authorId: 1, sort: ArticleListSort.Title, direction: SortDirection.Asc)))
            .Should().Equal("Опубликованная", "Черновик");
        (await TitlesAsync(Query(locale: "EN"))).Should().Equal("Английская");
    }

    [Fact]
    public async Task GivenTags_WhenFilteringByTag_ThenMatchesOnlyAWholeTag()
    {
        Add("Фикх", tags: "фикх,намаз");
        Add("Фикх намаза", tags: "фикх намаза");
        Add("Без тегов");

        (await TitlesAsync(Query(tag: "Фикх"))).Should().Equal("Фикх");
        (await TitlesAsync(Query(tag: "намаз"))).Should().Equal("Фикх");
    }

    [Fact]
    public async Task GivenArticles_WhenSortingByEachColumn_ThenOrdersAndBreaksTiesById()
    {
        Add("Б", ArticleStatus.Published, updatedDay: 1, publishedDay: 5);
        Add("А", ArticleStatus.Archived, updatedDay: 3, publishedDay: 2);
        Add("В", ArticleStatus.Draft, updatedDay: 2);
        Add("Г", ArticleStatus.InReview, updatedDay: 2);

        (await TitlesAsync(Query())).Should().Equal("А", "Г", "В", "Б");
        (await TitlesAsync(Query(sort: ArticleListSort.Title, direction: SortDirection.Asc))).Should().Equal("А", "Б", "В", "Г");
        (await TitlesAsync(Query(sort: ArticleListSort.Status, direction: SortDirection.Asc))).Should().Equal("В", "Г", "Б", "А");
        (await TitlesAsync(Query(sort: ArticleListSort.PublishedAt, direction: SortDirection.Asc))).Should().Equal("А", "Б", "В", "Г");
        (await TitlesAsync(Query(sort: ArticleListSort.PublishedAt, direction: SortDirection.Desc))).Should().Equal("Б", "А", "Г", "В");
    }

    [Fact]
    public async Task GivenManyArticles_WhenPaging_ThenReturnsTheTotalAndKeepsPagingInBounds()
    {
        for (var day = 0; day < 5; day++)
        {
            Add($"Статья {day}", updatedDay: day);
        }

        var second = await _articles.GetListAsync(Query(page: 2, pageSize: 2), TestViewers.Admin);
        second.Total.Should().Be(5);
        second.Items.Select(item => item.Title).Should().Equal("Статья 2", "Статья 1");

        var belowFirst = await _articles.GetListAsync(Query(page: 0, pageSize: 0), TestViewers.Admin);
        belowFirst.Page.Should().Be(1);
        belowFirst.PageSize.Should().Be(1);
        belowFirst.Items.Should().ContainSingle().Which.Title.Should().Be("Статья 4");

        (await _articles.GetListAsync(Query(pageSize: 1000), TestViewers.Admin)).PageSize.Should().Be(ArticleService.MaxPageSize);

        var pastTheEnd = await _articles.GetListAsync(Query(page: 9, pageSize: 2), TestViewers.Admin);
        pastTheEnd.Items.Should().BeEmpty();
        pastTheEnd.Total.Should().Be(5);
    }

    [Fact]
    public async Task GivenAnAuthor_WhenListing_ThenSeesPublishedAndOwnArticlesWithTheirOwnMovesOnly()
    {
        Add("Свой черновик", ArticleStatus.Draft, authorId: 7);
        Add("Соавторский", ArticleStatus.InReview, authorId: 8, coAuthorId: 7);
        Add("Чужой черновик", ArticleStatus.Draft, authorId: 8);
        Add("Чужая опубликованная", ArticleStatus.Published, authorId: 8);

        var page = await _articles.GetListAsync(Query(sort: ArticleListSort.Title, direction: SortDirection.Asc), TestViewers.Author(7));

        page.Total.Should().Be(3);
        page.Items.Select(item => item.Title).Should().Equal("Свой черновик", "Соавторский", "Чужая опубликованная");
        page.Items[0].AllowedTransitions.Should().Equal(ArticleStatus.InReview);
        page.Items[0].CanEdit.Should().BeTrue();
        page.Items[1].AllowedTransitions.Should().Equal(ArticleStatus.Draft);
        page.Items[2].AllowedTransitions.Should().BeEmpty();
        page.Items[2].CanEdit.Should().BeFalse();
    }

    [Fact]
    public async Task GivenAnArticleWithParagraphsAndTags_WhenListed_ThenCountsParagraphsAndSplitsTags()
    {
        Add("С текстом", ArticleStatus.InReview, tags: "фикх,намаз", paragraphs: 3);

        var item = (await _articles.GetListAsync(Query(), TestViewers.Admin)).Items.Single();

        item.ParagraphCount.Should().Be(3);
        item.Tags.Should().Equal("фикх", "намаз");
        item.AllowedTransitions.Should().BeEquivalentTo([ArticleStatus.Published, ArticleStatus.Draft]);
    }
}
