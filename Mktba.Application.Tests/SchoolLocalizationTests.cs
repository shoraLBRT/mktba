using FluentAssertions;
using Mktba.Application.Exceptions;
using Mktba.Application.Services;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Application.Tests;

/// <summary>I-07 (#111): the canonical schools are named in the reader's language.</summary>
public class SchoolLocalizationTests : IDisposable
{
    private readonly MktbaDbContext _context;
    private readonly SchoolService _service;

    public SchoolLocalizationTests()
    {
        _context = TestDbHelper.CreateInMemoryContext();
        _service = new SchoolService(new SchoolRepository(_context), new ArticleRepository(_context));
    }

    public void Dispose() => _context.Dispose();

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("ru")]
    public async Task GivenRussianOrNoLocale_WhenListingSystemSchools_ThenNamesAreRussian(string? locale)
    {
        await SystemSchoolSeeder.SeedAsync(_context);

        var schools = await _service.GetSystemSchoolsAsync(locale);

        schools.Select(s => s.Slug).Should().Equal("hanafi", "maliki", "shafii", "hanbali");
        schools.Select(s => s.Name).Should().Equal("Ханафитский мазхаб", "Маликитский мазхаб", "Шафиитский мазхаб", "Ханбалитский мазхаб");
        schools[0].ShortName.Should().Be("Хан");
    }

    [Theory]
    [InlineData("en")]
    [InlineData(" EN ")]
    public async Task GivenEnglish_WhenListingSystemSchools_ThenNamesAreEnglishWithTheSameIds(string locale)
    {
        await SystemSchoolSeeder.SeedAsync(_context);
        var russian = await _service.GetSystemSchoolsAsync("ru");

        var english = await _service.GetSystemSchoolsAsync(locale);

        english.Select(s => s.Id).Should().Equal(russian.Select(s => s.Id));
        english.Select(s => s.Slug).Should().Equal(russian.Select(s => s.Slug));
        english.Select(s => s.Name).Should().Equal("Hanafi madhhab", "Maliki madhhab", "Shafi'i madhhab", "Hanbali madhhab");
        english.Select(s => s.ShortName).Should().Equal("Han", "Mal", "Shaf", "Hanb");
        english.Should().OnlyContain(s => s.IsSystem && s.ArticleScopeId == null);
    }

    [Fact]
    public async Task GivenSchoolWithoutTranslation_WhenListingInEnglish_ThenItKeepsTheRussianName()
    {
        _context.Schools.Add(new School { Slug = "hanafi", Name = "Ханафитский мазхаб", ShortName = "Хан", IsSystem = true });
        _context.Schools.Add(new School
        {
            Slug = "maliki",
            Name = "Маликитский мазхаб",
            ShortName = "Мал",
            IsSystem = true,
            Translations = { new SchoolTranslation { Locale = "en", Name = "Maliki madhhab", ShortName = "Mal" } },
        });
        await _context.SaveChangesAsync();

        var schools = await _service.GetSystemSchoolsAsync("en");

        schools.Select(s => (s.Name, s.ShortName)).Should().Equal(("Ханафитский мазхаб", "Хан"), ("Maliki madhhab", "Mal"));
    }

    [Fact]
    public async Task GivenUnsupportedLocale_WhenListingSystemSchools_ThenLocaleUnsupported()
    {
        var act = () => _service.GetSystemSchoolsAsync("fr");

        (await act.Should().ThrowAsync<ValidationException>())
            .Which.Error.Code.Should().Be(AppErrors.LocaleUnsupported("fr").Code);
    }
}
