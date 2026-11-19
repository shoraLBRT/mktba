using System.Net;
using FluentAssertions;

namespace Mktba.Api.Tests;

/// <summary>
/// R-10 (#46): what <c>GET /search</c> rejects before it reaches the database. The search itself needs
/// PostgreSQL and is covered by <c>ArticleSearchTests</c> (Mktba.Application.Tests) and the e2e run.
/// </summary>
public sealed class SearchEndpointTests : IClassFixture<MktbaApiFactory>
{
    private readonly MktbaApiFactory _factory;

    public SearchEndpointTests(MktbaApiFactory factory)
    {
        _factory = factory;
    }

    [Theory]
    [InlineData("/search")]
    [InlineData("/search?q=")]
    [InlineData("/search?q=%20%20")]
    [InlineData("/search?q=a")]
    public async Task GivenMissingOrOneCharacterQuery_WhenAnonymousSearches_ThenReturns400WithTooShortCode(string url)
    {
        var response = await _factory.CreateClient().GetAsync(url);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("search_query_too_short");
    }

    [Fact]
    public async Task GivenQueryLongerThanTheLimit_WhenSearched_ThenReturns400WithTooLongCode()
    {
        var response = await _factory.CreateClient().GetAsync($"/search?q={new string('a', 201)}");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("search_query_too_long");
    }

    [Fact]
    public async Task GivenUnsupportedLocale_WhenSearched_ThenReturns400WithLocaleUnsupportedCode()
    {
        var response = await _factory.CreateClient().GetAsync("/search?q=namaz&locale=fr");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ApiJson.ReadCodeAsync(response)).Should().Be("locale_unsupported");
    }
}
