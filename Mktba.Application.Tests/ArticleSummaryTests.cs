using AutoMapper;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Mktba.Application.DTOs;
using Mktba.Application.Mappings;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>
/// A-07 (#95): the admin dashboard's article counts, counted in SQL. Run against a real PostgreSQL
/// (<see cref="PostgresDatabaseFixture"/>) so the aggregate queries are translated as in production.
/// </summary>
public class ArticleSummaryTests : IClassFixture<PostgresDatabaseFixture>
{
    private readonly PostgresDatabaseFixture _database;

    public ArticleSummaryTests(PostgresDatabaseFixture database)
    {
        _database = database;
    }

    [Fact]
    public async Task GivenArticlesWithAndWithoutContent_WhenSummaryIsRead_ThenCountsFollowTheHasContentRuleAndTheViewer()
    {
        await using (var seed = _database.CreateContext())
        {
            seed.Articles.AddRange(
                Article("with-opinion", ArticleStatus.Published, article => article.Paragraphs.Add(
                    new Paragraph { Order = 1, Opinions = { new Opinion { Content = "Текст", IsDefault = true } } })),
                Article("with-infobox-field", ArticleStatus.Draft, article => article.InfoboxFields.Add(
                    new ArticleInfoboxField { Key = "born", Label = "Родился", Value = "1000", Order = 1 })),
                Article("with-summary", ArticleStatus.InReview, article => article.Summary = "Кратко."),
                Article("with-infobox-title", ArticleStatus.Archived, article => article.InfoboxTitle = "Имам"),
                Article("empty-paragraph", ArticleStatus.Published, article => article.Paragraphs.Add(new Paragraph { Order = 1 })),
                Article("blank-texts", ArticleStatus.Draft, article =>
                {
                    article.Summary = "   ";
                    article.InfoboxSubtitle = " ";
                }),
                Article("bare", ArticleStatus.Draft));
            await seed.SaveChangesAsync();
        }

        await using var context = _database.CreateContext();
        var service = ServiceOn(context);

        var forAdmin = await service.GetSummaryAsync(TestViewers.Admin);
        var forOtherAuthor = await service.GetSummaryAsync(TestViewers.Author(int.MaxValue));

        forAdmin.Should().BeEquivalentTo(new ArticleSummaryDto
        {
            Total = 7,
            WithContent = 4,
            Empty = 3,
            ByStatus = new ArticleStatusCountsDto { Draft = 3, InReview = 1, Published = 2, Archived = 1 },
        });
        forOtherAuthor.Should().BeEquivalentTo(new ArticleSummaryDto
        {
            Total = 2,
            WithContent = 1,
            Empty = 1,
            ByStatus = new ArticleStatusCountsDto { Published = 2 },
        });
    }

    private static Article Article(string slug, ArticleStatus status, Action<Article>? fill = null)
    {
        var article = new Article { Title = $"Сводка {slug}", Slug = $"summary-{slug}", Status = status };
        fill?.Invoke(article);
        return article;
    }

    private static ArticleService ServiceOn(Infrastructure.Data.MktbaDbContext context)
    {
        var mapper = new MapperConfiguration(cfg => cfg.AddProfile<MappingProfile>(), NullLoggerFactory.Instance).CreateMapper();
        return new ArticleService(new ArticleRepository(context), mapper, TimeProvider.System, new RecordingSearchEngineNotifier());
    }
}
