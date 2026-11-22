using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Mktba.Domain.Entities;

namespace Mktba.Application.Tests;

/// <summary>
/// O-02 (#53): migration <c>MoveArticlesOffReservedSlugs</c> moves articles that already have a
/// reserved slug to the first free suffix and keeps the old slug as their redirect. It runs on a
/// real PostgreSQL (<see cref="PostgresDatabaseFixture"/>): rolled back, rows saved, applied again.
/// </summary>
public class ReservedSlugMigrationTests : IClassFixture<PostgresDatabaseFixture>
{
    private readonly PostgresDatabaseFixture _database;

    public ReservedSlugMigrationTests(PostgresDatabaseFixture database)
    {
        _database = database;
    }

    [Fact]
    public async Task GivenArticlesWithReservedSlugs_WhenMigrationRuns_ThenTheyGetFreeSuffixesAndRedirectFromTheOldSlug()
    {
        Article search, searchTaken, englishAdmin, ordinary;
        await using (var context = _database.CreatePreTrashContext())
        {
            var migrations = context.Database.GetMigrations().ToList();
            var before = migrations[migrations.FindIndex(id => id.EndsWith("_MoveArticlesOffReservedSlugs", StringComparison.Ordinal)) - 1];
            var migrator = context.GetService<IMigrator>();
            await migrator.MigrateAsync(before);

            search = Article("Поиск", "search");
            searchTaken = Article("Поиск 2", "search-2");
            englishAdmin = Article("Admin", "admin", "en");
            ordinary = Article("Намаз", "namaz");
            context.AddRange(search, searchTaken, englishAdmin, ordinary);
            await context.SaveChangesAsync();

            await migrator.MigrateAsync();
        }

        await using var check = _database.CreateContext();
        var slugs = await check.Articles.AsNoTracking().ToDictionaryAsync(article => article.Id, article => article.Slug);
        slugs[search.Id].Should().Be("search-3");
        slugs[searchTaken.Id].Should().Be("search-2");
        slugs[englishAdmin.Id].Should().Be("admin-2");
        slugs[ordinary.Id].Should().Be("namaz");

        var redirects = await check.ArticleSlugRedirects.AsNoTracking()
            .Select(redirect => new { redirect.ArticleId, redirect.Locale, redirect.Slug })
            .ToListAsync();
        redirects.Should().BeEquivalentTo([
            new { ArticleId = search.Id, Locale = "ru", Slug = "search" },
            new { ArticleId = englishAdmin.Id, Locale = "en", Slug = "admin" },
        ]);
    }

    private static Article Article(string title, string slug, string locale = "ru")
        => new() { Title = title, Slug = slug, Locale = locale, Status = ArticleStatus.Published };
}
