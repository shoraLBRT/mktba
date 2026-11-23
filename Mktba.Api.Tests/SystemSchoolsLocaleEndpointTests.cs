using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Mktba.Application.DTOs;
using Mktba.Infrastructure.Data;

namespace Mktba.Api.Tests;

/// <summary>I-07 (#111): <c>GET /schools/system?locale=</c> names the canonical schools in the reader's language.</summary>
public sealed class SystemSchoolsLocaleEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public SystemSchoolsLocaleEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GivenNoLocale_WhenReadingSystemSchools_ThenNamesAreRussian()
    {
        var schools = await ReadAsync("/schools/system");

        schools.Single(s => s.Slug == "hanafi").Name.Should().Be("Ханафитский мазхаб");
    }

    [Fact]
    public async Task GivenEnglish_WhenReadingSystemSchools_ThenNamesAreEnglishWithTheSameIds()
    {
        var russian = await ReadAsync("/schools/system");

        var english = await ReadAsync("/schools/system?locale=en");

        english.Select(s => s.Id).Should().Equal(russian.Select(s => s.Id));
        english.Single(s => s.Slug == "shafii").Should().Match<SchoolDto>(s => s.Name == "Shafi'i madhhab" && s.ShortName == "Shaf");
    }

    [Fact]
    public async Task GivenUnsupportedLocale_WhenReadingSystemSchools_ThenReturns400WithLocaleUnsupportedCode()
    {
        var response = await _factory.CreateClient().GetAsync("/schools/system?locale=fr");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("locale_unsupported");
    }

    private async Task<List<SchoolDto>> ReadAsync(string path)
    {
        using (var scope = _factory.Services.CreateScope())
        {
            await SystemSchoolSeeder.SeedAsync(scope.ServiceProvider.GetRequiredService<MktbaDbContext>());
        }

        var response = await _factory.CreateClient().GetAsync(path);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<List<SchoolDto>>(ApiJson.Options))!;
    }
}
