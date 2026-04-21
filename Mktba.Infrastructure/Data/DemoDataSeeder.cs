using Mktba.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Mktba.Infrastructure.Data;

public static class DemoDataSeeder
{
    private static readonly (string Slug, string Name, string ShortName)[] SystemSchools =
    [
        ("hanafi",  "Ханафитский мазхаб",  "Хан"),
        ("maliki",  "Маликитский мазхаб",  "Мал"),
        ("shafii",  "Шафиитский мазхаб",   "Шаф"),
        ("hanbali", "Ханбалитский мазхаб", "Ханб"),
    ];

    public static async Task SeedAsync(MktbaDbContext context)
    {
        await SeedSystemSchoolsAsync(context);
    }

    private static async Task SeedSystemSchoolsAsync(MktbaDbContext context)
    {
        foreach (var (slug, name, shortName) in SystemSchools)
        {
            var exists = await context.Schools.AnyAsync(s => s.Slug == slug);
            if (!exists)
            {
                context.Schools.Add(new School
                {
                    Slug = slug,
                    Name = name,
                    ShortName = shortName,
                    IsSystem = true,
                    ArticleScopeId = null,
                });
            }
        }

        await context.SaveChangesAsync();
    }
}
