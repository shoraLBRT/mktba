using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Mktba.Domain.Entities;

namespace Mktba.Application.Tests;

/// <summary>
/// U-05 (#126): migration <c>AddReaderAccounts</c> counts every existing user's address as confirmed
/// and moves articles off the new reserved slugs (<c>register</c>, <c>confirm-email</c>,
/// <c>reset-password</c>) as <c>MoveArticlesOffReservedSlugs</c> did. Runs on a real PostgreSQL
/// (<see cref="PostgresDatabaseFixture"/>): rolled back, rows saved, applied again.
/// </summary>
public class ReaderAccountsMigrationTests : IClassFixture<PostgresDatabaseFixture>
{
    private readonly PostgresDatabaseFixture _database;

    public ReaderAccountsMigrationTests(PostgresDatabaseFixture database)
    {
        _database = database;
    }

    [Fact]
    public async Task GivenUsersAndArticlesAtNewReservedSlugs_WhenMigrationRuns_ThenUsersAreConfirmedAndArticlesMove()
    {
        Article register, resetPassword, ordinary;
        var createdAt = new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc);
        await using (var context = _database.CreateContext())
        {
            var migrations = context.Database.GetMigrations().ToList();
            var before = migrations[migrations.FindIndex(id => id.EndsWith("_AddReaderAccounts", StringComparison.Ordinal)) - 1];
            var migrator = context.GetService<IMigrator>();
            await migrator.MigrateAsync(before);

            // Written by hand: the model already has the column this migration adds.
            await context.Database.ExecuteSqlInterpolatedAsync(
                $"""INSERT INTO "Users" ("Email", "PasswordHash", "Role", "CreatedAtUtc") VALUES ('old@mktba.test', 'x', 'Author', {createdAt})""");

            register = Article("Регистрация", "register");
            resetPassword = Article("Reset", "reset-password", "en");
            ordinary = Article("Намаз", "namaz");
            context.AddRange(register, resetPassword, ordinary);
            await context.SaveChangesAsync();

            await migrator.MigrateAsync();
        }

        await using var check = _database.CreateContext();
        var user = await check.Users.AsNoTracking().SingleAsync(candidate => candidate.Email == "old@mktba.test");
        user.EmailConfirmedAtUtc.Should().Be(createdAt);

        var slugs = await check.Articles.AsNoTracking().ToDictionaryAsync(article => article.Id, article => article.Slug);
        slugs[register.Id].Should().Be("register-2");
        slugs[resetPassword.Id].Should().Be("reset-password-2");
        slugs[ordinary.Id].Should().Be("namaz");

        var redirects = await check.ArticleSlugRedirects.AsNoTracking()
            .Select(redirect => new { redirect.ArticleId, redirect.Locale, redirect.Slug })
            .ToListAsync();
        redirects.Should().BeEquivalentTo([
            new { ArticleId = register.Id, Locale = "ru", Slug = "register" },
            new { ArticleId = resetPassword.Id, Locale = "en", Slug = "reset-password" },
        ]);
    }

    private static Article Article(string title, string slug, string locale = "ru")
        => new() { Title = title, Slug = slug, Locale = locale, Status = ArticleStatus.Published };
}
