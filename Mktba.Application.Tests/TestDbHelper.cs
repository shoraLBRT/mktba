using Microsoft.EntityFrameworkCore;
using Mktba.Infrastructure.Data;

namespace Mktba.Application.Tests;

internal static class TestDbHelper
{
    public static MktbaDbContext CreateInMemoryContext()
    {
        var options = new DbContextOptionsBuilder<MktbaDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        var context = new MktbaDbContext(options);
        context.Database.EnsureCreated();
        return context;
    }
}
