using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Mktba.Application.DTOs;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>
/// R-10 (#46): full-text search, run against a real PostgreSQL (<see cref="PostgresDatabaseFixture"/>).
/// The tests share one database, so each one searches for words only its own articles hold.
/// </summary>
public class ArticleSearchTests : IClassFixture<PostgresDatabaseFixture>
{
    private readonly PostgresDatabaseFixture _database;

    public ArticleSearchTests(PostgresDatabaseFixture database)
    {
        _database = database;
    }

    [Fact]
    public async Task GivenWordInOpinionText_WhenSearchedInAnotherGrammaticalForm_ThenArticleIsFoundWithHighlightedSnippet()
    {
        var article = await SaveAsync(Published("Морфология", "morfologiya", opinions: "Условия действительности омовения перечислены ниже."));

        var results = await SearchAsync("омовением");

        var found = results.Items.Should().ContainSingle().Subject;
        found.Id.Should().Be(article.Id);
        found.Slug.Should().Be("morfologiya");
        found.ParagraphId.Should().Be(article.Paragraphs.Single().Id);
        found.Snippet.Should().Contain(new SearchTextSegmentDto("омовения", true));
        Text(found.Snippet).Should().Be("Условия действительности омовения перечислены ниже");
        results.Total.Should().Be(1);
    }

    [Fact]
    public async Task GivenWordsSpreadOverTitleAndOpinion_WhenAllAreSearched_ThenArticleIsFound()
    {
        var article = await SaveAsync(Published("Закят с урожая", "zakyat", opinions: "Нисаб пшеницы составляет пять васков."));
        await SaveAsync(Published("Просто васки", "vaski", opinions: "Васк — мера объёма."));

        var results = await SearchAsync("закят васков");

        results.Items.Select(item => item.Id).Should().Equal(article.Id);
        results.Items[0].Title.Should().Contain(new SearchTextSegmentDto("Закят", true));
    }

    [Fact]
    public async Task GivenMatchesInTitleSummaryTagsAndText_WhenSearched_ThenTitleMatchComesFirstAndAllAreFound()
    {
        var inText = await SaveAsync(Published("Первая", "rank-text", opinions: "Здесь упомянут тахарат один раз."));
        var inTitle = await SaveAsync(Published("Тахарат", "rank-title", opinions: "Совсем другой текст."));
        var inSummary = await SaveAsync(Published("Вторая", "rank-summary", summary: "Кратко про тахарат."));
        var inTags = await SaveAsync(Published("Третья", "rank-tags", tags: "фикх,тахарат"));

        var results = await SearchAsync("тахарат");

        results.Items.Select(item => item.Id).Should().BeEquivalentTo([inText.Id, inTitle.Id, inSummary.Id, inTags.Id]);
        results.Items[0].Id.Should().Be(inTitle.Id);
        results.Items[^1].Id.Should().Be(inText.Id);
        results.Items.Single(item => item.Id == inSummary.Id).Summary.Should().Contain(new SearchTextSegmentDto("тахарат", true));
        results.Items.Single(item => item.Id == inTags.Id).Snippet.Should().BeNull();
        results.Items.Single(item => item.Id == inTags.Id).ParagraphId.Should().BeNull();
    }

    [Fact]
    public async Task GivenDraftArchivedTrashedAndHiddenUnderDraftParent_WhenSearched_ThenOnlyTheReachablePublishedArticleIsFound()
    {
        var visibleParent = Published("Раздел видимый", "visible-parent");
        var visible = await SaveAsync(Published("Истинджа открытая", "visible-child", parent: visibleParent));
        await SaveAsync(Published("Истинджа черновик", "draft", status: ArticleStatus.Draft));
        await SaveAsync(Published("Истинджа архив", "archived", status: ArticleStatus.Archived));
        await SaveAsync(Published("Истинджа на проверке", "in-review", opinions: "Истинджа", status: ArticleStatus.InReview));
        var draftParent = Published("Раздел скрытый", "hidden-parent", status: ArticleStatus.Draft);
        await SaveAsync(Published("Истинджа под черновиком", "hidden-child", opinions: "Истинджа", parent: draftParent));
        var trashed = Published("Истинджа в корзине", "trashed");
        trashed.DeletedAt = new DateTime(2026, 11, 22, 0, 0, 0, DateTimeKind.Utc);
        await SaveAsync(trashed);

        var results = await SearchAsync("истинджа");

        results.Items.Select(item => item.Id).Should().Equal(visible.Id);
        results.Total.Should().Be(1);
    }

    [Fact]
    public async Task GivenArticlesInTwoLocales_WhenSearched_ThenOnlyTheRequestedLocaleIsFound()
    {
        var russian = await SaveAsync(Published("Tayammum по-русски", "tayammum-ru"));
        var english = await SaveAsync(Published("Tayammum in English", "tayammum-en", locale: "en"));

        (await SearchAsync("tayammum")).Items.Select(item => item.Id).Should().Equal(russian.Id);
        (await SearchAsync("tayammum", locale: "en")).Items.Select(item => item.Id).Should().Equal(english.Id);
    }

    [Fact]
    public async Task GivenAnEnglishArticle_WhenSearchedWithOtherWordForms_ThenEnglishMorphologyFindsIt()
    {
        var article = await SaveAsync(Published("Prayers of travellers", "travellers-prayers", locale: "en",
            opinions: "A traveller shortens the obligatory prayers."));

        var found = (await SearchAsync("traveller prayer shortened", locale: "en")).Items.Should().ContainSingle().Subject;

        found.Id.Should().Be(article.Id);
        found.Title.Should().Contain(new SearchTextSegmentDto("Prayers", true));
        found.Snippet.Should().Contain(new SearchTextSegmentDto("shortens", true));
    }

    [Fact]
    public async Task GivenArticlesInEachLocale_WhenIndexed_ThenEachUsesTheConfigurationOfItsLanguage()
    {
        var russian = await SaveAsync(Published("Намазы", "config-ru", opinions: "Намазы в пути."));
        var english = await SaveAsync(Published("Prayers", "config-en", locale: "en", opinions: "Prayers on the road."));

        await using var context = _database.CreateContext();
        (await context.Database.SqlQuery<string>($"""
            SELECT mktba_search_config(l)::text AS "Value" FROM unnest(ARRAY['ru', 'en', 'xx']) WITH ORDINALITY AS t(l, n) ORDER BY n
            """).ToListAsync()).Should().Equal("russian", "english", "russian");

        foreach (var (article, configuration) in new[] { (russian, "russian"), (english, "english") })
        {
            var matches = await context.Database.SqlQuery<bool>($"""
                SELECT a."SearchVector" = setweight(to_tsvector({configuration}::regconfig, a."Title"), 'A')
                        || setweight(to_tsvector({configuration}::regconfig, ' '), 'B')
                    AND o."SearchVector" = setweight(to_tsvector({configuration}::regconfig, o."Content"), 'D') AS "Value"
                FROM "Articles" a
                JOIN "Paragraphs" p ON p."ArticleId" = a."Id"
                JOIN "Opinions" o ON o."ParagraphId" = p."Id"
                WHERE a."Id" = {article.Id}
                """).SingleAsync();
            matches.Should().BeTrue($"the {article.Locale} article is indexed with the {configuration} configuration");
        }
    }

    [Fact]
    public async Task GivenMarkdownAndHtmlInOpinion_WhenSearched_ThenSnippetIsPlainTextAndLinkTargetsAreNotSearched()
    {
        await SaveAsync(Published("Разметка", "markup", opinions:
            "## Заголовок\n\n**Сивак** описан в [книге](https://example.org/kitabsecret) <script>alert('x')</script> и <b>далее</b>."));

        var found = (await SearchAsync("сивак")).Items.Should().ContainSingle().Subject;

        var snippet = Text(found.Snippet);
        snippet.Should().Contain("Сивак описан в книге").And.Contain("alert('x')");
        snippet.Should().NotContainAny("<", ">", "**", "##", "](", "example.org");
        found.Snippet.Should().Contain(new SearchTextSegmentDto("Сивак", true));
        (await SearchAsync("kitabsecret")).Items.Should().BeEmpty();
    }

    [Fact]
    public async Task GivenYoInTextAndYeInQuery_WhenSearchedEitherWay_ThenArticleIsFound()
    {
        var article = await SaveAsync(Published("Счёт ракаатов", "schet"));

        (await SearchAsync("счет ракаатов")).Items.Select(item => item.Id).Should().Equal(article.Id);
        (await SearchAsync("счёт")).Items.Select(item => item.Id).Should().Equal(article.Id);
        (await SearchAsync("счёт")).Items[0].Title[0].Should().Be(new SearchTextSegmentDto("Счёт", true));
    }

    [Fact]
    public async Task GivenMoreMatchesThanAPage_WhenPaged_ThenPagesDoNotOverlapAndTotalIsKeptPastTheEnd()
    {
        for (var number = 1; number <= 5; number++)
        {
            await SaveAsync(Published($"Джаназа {number}", $"dzhanaza-{number}"));
        }

        var first = await SearchAsync("джаназа", page: 1, pageSize: 2);
        var second = await SearchAsync("джаназа", page: 2, pageSize: 2);
        var third = await SearchAsync("джаназа", page: 3, pageSize: 2);
        var pastTheEnd = await SearchAsync("джаназа", page: 9, pageSize: 2);

        first.Total.Should().Be(5);
        first.Items.Should().HaveCount(2);
        third.Items.Should().HaveCount(1);
        first.Items.Concat(second.Items).Concat(third.Items).Select(item => item.Id).Should().OnlyHaveUniqueItems().And.HaveCount(5);
        pastTheEnd.Items.Should().BeEmpty();
        pastTheEnd.Total.Should().Be(5);
        pastTheEnd.Page.Should().Be(9);
    }

    [Fact]
    public async Task GivenMatchesInTheDefaultLocaleOnly_WhenCounted_ThenTheCountIsWhatTheResultsPageFinds()
    {
        for (var number = 1; number <= 3; number++)
        {
            await SaveAsync(Published($"Хадж {number}", $"hadzh-{number}"));
        }
        await SaveAsync(Published("Хадж in English", "hadzh-en", locale: "en"));

        await using var context = _database.CreateContext();
        var service = new ArticleSearchService(new ArticleSearchRepository(context));

        (await service.CountAsync("хадж")).Should().Be(3);
        (await service.CountAsync("словокоторогонетнигде")).Should().Be(0);
    }

    [Fact]
    public async Task GivenArticlesWithAndWithoutCurrentConfirmations_WhenSearchedForVerifiedOnly_ThenOnlyVerifiedOnesAreFoundAndMarked()
    {
        var confirmed = await SaveAsync(Published("Фидья с золота", "fidya-zoloto"));
        var sameText = await SaveAsync(Published("Фидья с серебра", "fidya-serebro"));
        var stale = await SaveAsync(Published("Фидья с урожая", "fidya-urozhai"));
        var disputed = await SaveAsync(Published("Фидья со скота", "fidya-skot"));
        await SaveAsync(Published("Фидья с денег", "fidya-dengi"));

        await using (var context = _database.CreateContext())
        {
            var scholar = new User { Email = $"{Guid.NewGuid():N}@mktba.test", Role = UserRole.Scholar };
            var critic = new User { Email = $"{Guid.NewGuid():N}@mktba.test", Role = UserRole.Scholar };
            context.Users.AddRange(scholar, critic);
            await context.SaveChangesAsync();
            foreach (var user in new[] { scholar, critic })
            {
                context.ScholarApplications.Add(new ScholarApplication
                {
                    UserId = user.Id, Degree = "Доктор наук", Institution = "Университет", Specialization = "Фикх",
                    Status = ScholarApplicationStatus.Approved, SubmittedAt = DateTime.UtcNow, ClosedAt = DateTime.UtcNow,
                    RoleBeforeApproval = UserRole.Reader,
                });
            }

            // The reviewed revision is 1; the latest is 2 with the same text (still current) or another (stale).
            ArticleRevision Revision(Article article, int number, char hash) => new()
            {
                ArticleId = article.Id, Number = number, CreatedAt = DateTime.UtcNow, Snapshot = "{}",
                Fingerprints = [new ArticleRevisionFingerprint { Scope = ArticleRevisionFingerprint.WholeArticle, Hash = new string(hash, 64) }],
            };
            ArticleReview Review(Article article, ArticleRevision revision, User user, ArticleReviewVerdict verdict) => new()
            {
                ArticleId = article.Id, Revision = revision, ScholarId = user.Id, Verdict = verdict, Comment = "Комментарий",
                CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
            };

            var confirmedRevision = Revision(confirmed, 1, 'a');
            var sameTextRevision = Revision(sameText, 1, 'b');
            var staleRevision = Revision(stale, 1, 'c');
            var disputedRevision = Revision(disputed, 1, 'd');
            context.ArticleRevisions.AddRange(
                confirmedRevision, sameTextRevision, Revision(sameText, 2, 'b'), staleRevision, Revision(stale, 2, 'e'), disputedRevision);
            context.ArticleReviews.AddRange(
                Review(confirmed, confirmedRevision, scholar, ArticleReviewVerdict.Confirmed),
                Review(sameText, sameTextRevision, scholar, ArticleReviewVerdict.ConfirmedWithRemarks),
                Review(stale, staleRevision, scholar, ArticleReviewVerdict.Confirmed),
                Review(disputed, disputedRevision, scholar, ArticleReviewVerdict.Confirmed),
                Review(disputed, disputedRevision, critic, ArticleReviewVerdict.HasErrors));
            await context.SaveChangesAsync();
        }

        var all = await SearchAsync("фидья");
        await using var searchContext = _database.CreateContext();
        var verifiedOnly = await new ArticleSearchService(new ArticleSearchRepository(searchContext))
            .SearchAsync("фидья", null, 1, 10, verifiedOnly: true);

        all.Total.Should().Be(5);
        all.Items.Where(item => item.IsVerified).Select(item => item.Id).Should().BeEquivalentTo([confirmed.Id, sameText.Id]);
        verifiedOnly.Total.Should().Be(2);
        verifiedOnly.Items.Select(item => (item.Id, item.IsVerified)).Should().BeEquivalentTo([(confirmed.Id, true), (sameText.Id, true)]);
    }

    [Fact]
    public async Task GivenOutOfRangePaging_WhenSearched_ThenPageAndPageSizeAreClamped()
    {
        var results = await SearchAsync("ничегонет", page: -3, pageSize: 1000);

        results.Page.Should().Be(1);
        results.PageSize.Should().Be(ArticleSearchService.MaxPageSize);
        (await SearchAsync("ничегонет", page: 100000, pageSize: 10)).Page.Should().Be(ArticleSearchService.MaxPage);
    }

    [Theory]
    [InlineData("словокоторогонет")]
    [InlineData("и в на")]
    [InlineData("!!! ???")]
    [InlineData("' OR 1=1 --")]
    [InlineData("a & | ! ( ) :* <->")]
    public async Task GivenQueryWithNoMatchStopWordsOrOperators_WhenSearched_ThenResultIsEmptyAndNothingFails(string query)
    {
        var results = await SearchAsync(query);

        results.Items.Should().BeEmpty();
        results.Total.Should().Be(0);
    }

    [Fact]
    public async Task GivenOpinionEditedAndDeleted_WhenSearched_ThenIndexFollowsTheText()
    {
        var article = await SaveAsync(Published("Изменяемая", "changing", opinions: "Старое слово кусуф."));

        await using (var context = _database.CreateContext())
        {
            var opinion = await context.Set<Opinion>().SingleAsync(o => o.Paragraph.ArticleId == article.Id);
            opinion.Content = "Новое слово хусуф.";
            await context.SaveChangesAsync();
        }

        (await SearchAsync("кусуф")).Items.Should().BeEmpty();
        (await SearchAsync("хусуф")).Items.Select(item => item.Id).Should().Equal(article.Id);

        await using (var context = _database.CreateContext())
        {
            context.Remove(await context.Set<Paragraph>().SingleAsync(p => p.ArticleId == article.Id));
            await context.SaveChangesAsync();
        }

        (await SearchAsync("хусуф")).Items.Should().BeEmpty();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(" я ")]
    public async Task GivenEmptyOrOneCharacterQuery_WhenSearched_ThenValidationFailsWithTooShortCode(string? query)
    {
        var act = () => SearchAsync(query);

        (await act.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("search_query_too_short");
    }

    [Fact]
    public async Task GivenTooLongQueryOrUnsupportedLocale_WhenSearched_ThenValidationFails()
    {
        var tooLong = () => SearchAsync(new string('а', ArticleSearchService.MaxQueryLength + 1));
        var badLocale = () => SearchAsync("намаз", locale: "fr");

        (await tooLong.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("search_query_too_long");
        (await badLocale.Should().ThrowAsync<ValidationException>()).Which.Error.Code.Should().Be("locale_unsupported");
    }

    [Fact]
    public void GivenMarkedText_WhenParsed_ThenMarkersNeverReachTheSegments()
    {
        var start = ArticleSearchRepository.MatchStart;
        var end = ArticleSearchRepository.MatchEnd;

        ArticleSearchService.ParseSegments($"до {start}слово{end} после").Should().Equal(
            new SearchTextSegmentDto("до ", false),
            new SearchTextSegmentDto("слово", true),
            new SearchTextSegmentDto(" после", false));
        ArticleSearchService.ParseSegments($"{end}а{end}б{start}{start}в").Should().Equal(
            new SearchTextSegmentDto("аб", false),
            new SearchTextSegmentDto("в", true));
        ArticleSearchService.ParseSegments(string.Empty).Should().BeEmpty();
    }

    /// <summary>
    /// The migration is reversible and fills the index for rows that already exist: rolled back to the
    /// migration before it and applied again on a database of its own, with an article saved in between.
    /// </summary>
    [Fact]
    public async Task GivenExistingArticles_WhenSearchMigrationIsRevertedAndAppliedAgain_ThenTheyAreSearchable()
    {
        var database = new PostgresDatabaseFixture();
        await database.InitializeAsync();
        try
        {
            int articleId;
            await using (var context = database.CreatePreTrashContext())
            {
                // Migrations are found by the real context type; the row is written without the trash columns.
                await using var migrating = database.CreateContext();
                var migrations = migrating.Database.GetMigrations().ToList();
                var before = migrations[migrations.FindIndex(id => id.EndsWith("_AddArticleSearch", StringComparison.Ordinal)) - 1];
                var migrator = migrating.GetService<IMigrator>();

                await migrator.MigrateAsync(before);
                var article = Published("Существующая", "existing", opinions: "Текст про итикаф.");
                context.Add(article);
                await context.SaveChangesAsync();
                articleId = article.Id;
                await migrator.MigrateAsync();
            }

            await using var searchContext = database.CreateContext();
            var results = await new ArticleSearchService(new ArticleSearchRepository(searchContext)).SearchAsync("итикаф", null, 1, 10);

            results.Items.Select(item => item.Id).Should().Equal(articleId);
        }
        finally
        {
            await database.DisposeAsync();
        }
    }

    private static string Text(List<SearchTextSegmentDto>? segments) => string.Concat(segments!.Select(segment => segment.Text));

    private static Article Published(
        string title,
        string slug,
        string? opinions = null,
        string? summary = null,
        string? tags = null,
        string locale = "ru",
        ArticleStatus status = ArticleStatus.Published,
        Article? parent = null)
        => new()
        {
            Title = title,
            Slug = slug,
            Locale = locale,
            Status = status,
            Summary = summary,
            TagsSearchText = tags,
            ParentArticle = parent,
            Paragraphs = opinions is null
                ? []
                : [new Paragraph { Order = 1, Opinions = [new Opinion { Content = opinions, IsDefault = true }] }],
        };

    private async Task<Article> SaveAsync(Article article)
    {
        await using var context = _database.CreateContext();
        context.Add(article);
        await context.SaveChangesAsync();
        return article;
    }

    private async Task<SearchResultsDto> SearchAsync(string? query, string? locale = null, int page = 1, int pageSize = 10)
    {
        await using var context = _database.CreateContext();
        return await new ArticleSearchService(new ArticleSearchRepository(context)).SearchAsync(query, locale, page, pageSize);
    }
}
