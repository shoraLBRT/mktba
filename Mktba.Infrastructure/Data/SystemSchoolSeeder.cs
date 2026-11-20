using Mktba.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Mktba.Infrastructure.Data;

/// <summary>
/// Reference data every database needs, production included: the four canonical schools (with their
/// English names). Idempotent; run by <see cref="DatabaseMigrator.MigrateAsync"/> after the migrations.
/// Demo content is not seeded here — it comes from <c>scripts/seed-demo-content.mjs</c> through the API.
/// </summary>
public static class SystemSchoolSeeder
{
    private static readonly (string Slug, string Name, string ShortName, string EnName, string EnShortName)[] SystemSchools =
    [
        ("hanafi",  "Ханафитский мазхаб",  "Хан",  "Hanafi madhhab",  "Han"),
        ("maliki",  "Маликитский мазхаб",  "Мал",  "Maliki madhhab",  "Mal"),
        ("shafii",  "Шафиитский мазхаб",   "Шаф",  "Shafi'i madhhab", "Shaf"),
        ("hanbali", "Ханбалитский мазхаб", "Ханб", "Hanbali madhhab", "Hanb"),
    ];

    public static async Task SeedAsync(MktbaDbContext context)
    {
        await SeedSystemSchoolsAsync(context);
    }

    private static async Task SeedSystemSchoolsAsync(MktbaDbContext context)
    {
        foreach (var (slug, name, shortName, enName, enShortName) in SystemSchools)
        {
            var school = await context.Schools
                .Include(s => s.Translations)
                .FirstOrDefaultAsync(s => s.Slug == slug);
            if (school is null)
            {
                school = new School
                {
                    Slug = slug,
                    Name = name,
                    ShortName = shortName,
                    IsSystem = true,
                    ArticleScopeId = null,
                };
                context.Schools.Add(school);
            }

            if (school.Translations.All(t => t.Locale != "en"))
            {
                school.Translations.Add(new SchoolTranslation { Locale = "en", Name = enName, ShortName = enShortName });
            }
        }

        await context.SaveChangesAsync();
    }
}
