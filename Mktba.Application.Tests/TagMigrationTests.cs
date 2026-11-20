using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Mktba.Application.Services;
using Mktba.Domain.Entities;

namespace Mktba.Application.Tests;

/// <summary>
/// M-06 (#70): migration <c>AddTags</c> turns the comma-separated tags into tags of each article's
/// language with the rules of <see cref="TagRules"/>, rewrites the search copy from them, and moves an
/// article off the slug <c>tags</c>. Runs on a real PostgreSQL: rolled back, rows saved, applied again.
/// </summary>
public class TagMigrationTests : IClassFixture<PostgresDatabaseFixture>
{
    private readonly PostgresDatabaseFixture _database;

    public TagMigrationTests(PostgresDatabaseFixture database)
    {
        _database = database;
    }

    [Fact]
    public async Task GivenCommaSeparatedTags_WhenMigrationRuns_ThenEachLanguageGetsOneTagPerNameWithSlugsAndOrder()
    {
        Article first, second, english, untagged, onTagsSlug;
        await using (var context = _database.CreateContext())
        {
            var migrations = context.Database.GetMigrations().ToList();
            var before = migrations[migrations.FindIndex(id => id.EndsWith("_AddTags", StringComparison.Ordinal)) - 1];
            var migrator = context.GetService<IMigrator>();
            await migrator.MigrateAsync(before);

            first = Article("Первая", "pervaya", " Фикх ,намаз,  Фикх   намаза ,123");
            second = Article("Вторая", "vtoraya", "намаз,ФИКХ,,Ёлка,елка");
            english = Article("Prayer", "prayer", "фикх,Salah", "en");
            untagged = Article("Без тегов", "bez-tegov", null);
            onTagsSlug = Article("Теги", "tags", null);
            context.AddRange(first, second, english, untagged, onTagsSlug);
            await context.SaveChangesAsync();

            await migrator.MigrateAsync();
        }

        await using var check = _database.CreateContext();
        var tags = await check.Tags.AsNoTracking().OrderBy(t => t.Id)
            .Select(t => new { t.Locale, t.Name, t.NormalizedName, t.Slug })
            .ToListAsync();
        tags.Should().Equal(
            new { Locale = "ru", Name = "Фикх", NormalizedName = "фикх", Slug = "fikkh" },
            new { Locale = "ru", Name = "намаз", NormalizedName = "намаз", Slug = "namaz" },
            new { Locale = "ru", Name = "Фикх намаза", NormalizedName = "фикх намаза", Slug = "fikkh-namaza" },
            new { Locale = "ru", Name = "123", NormalizedName = "123", Slug = "tag-123" },
            new { Locale = "ru", Name = "Ёлка", NormalizedName = "елка", Slug = "yolka" },
            new { Locale = "en", Name = "фикх", NormalizedName = "фикх", Slug = "fikkh" },
            new { Locale = "en", Name = "Salah", NormalizedName = "salah", Slug = "salah" });
        foreach (var tag in tags)
        {
            TagRules.KeyOf(tag.Name).Should().Be(tag.NormalizedName);
            TagRules.SlugFromName(tag.Name).Should().Be(tag.Slug);
        }

        async Task<List<string>> NamesAsync(int articleId) => await check.ArticleTags.AsNoTracking()
            .Where(link => link.ArticleId == articleId).OrderBy(link => link.Order).Select(link => link.Tag.Name).ToListAsync();
        (await NamesAsync(first.Id)).Should().Equal("Фикх", "намаз", "Фикх намаза", "123");
        (await NamesAsync(second.Id)).Should().Equal("намаз", "Фикх", "Ёлка");
        (await NamesAsync(english.Id)).Should().Equal("фикх", "Salah");
        (await NamesAsync(untagged.Id)).Should().BeEmpty();

        var articles = await check.Articles.AsNoTracking().ToDictionaryAsync(a => a.Id);
        articles[first.Id].TagsSearchText.Should().Be("Фикх,намаз,Фикх намаза,123");
        articles[second.Id].TagsSearchText.Should().Be("намаз,Фикх,Ёлка");
        articles[untagged.Id].TagsSearchText.Should().BeNull();
        articles[onTagsSlug.Id].Slug.Should().Be("tags-2");
        (await check.ArticleSlugRedirects.AsNoTracking().AnyAsync(r => r.ArticleId == onTagsSlug.Id && r.Slug == "tags"))
            .Should().BeTrue();
    }

    private static Article Article(string title, string slug, string? tags, string locale = "ru")
        => new() { Title = title, Slug = slug, Locale = locale, Status = ArticleStatus.Published, TagsSearchText = tags };
}
