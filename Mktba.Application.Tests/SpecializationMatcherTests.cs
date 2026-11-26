using FluentAssertions;
using Mktba.Application.Services.Verification;

namespace Mktba.Application.Tests;

/// <summary>V-07 (#123): the crude match of a scholar's free-text specialization to an article's words.</summary>
public sealed class SpecializationMatcherTests
{
    [Theory]
    [InlineData("Исламское право (фикх)", new[] { "фикх" })]
    [InlineData("Хадисоведение; тафсир Корана, тафсир", new[] { "хадисоведение", "тафсир", "корана" })]
    [InlineData("Акыда, Ёмкость", new[] { "акыда", "емкость" })]
    [InlineData("Исламские науки, шариат, богословие", new string[0])]
    [InlineData("   ", new string[0])]
    [InlineData(null, new string[0])]
    public void GivenASpecialization_WhenItsKeywordsAreTaken_ThenShortAndGenericWordsAreDropped(string? specialization, string[] expected) =>
        SpecializationMatcher.Keywords(specialization).Should().Equal(expected);

    [Theory]
    [InlineData("Фикх", "Основы фикха", true)]
    [InlineData("Хадисоведение", "Хадисы о посте", true)]
    [InlineData("Тафсир Корана", "Чтение Корана", true)]
    [InlineData("Хадисоведение", "Хадж", false)]
    [InlineData("Сира", "Сирия", false)]
    [InlineData("Исламское право", "Исламское право", false)]
    public void GivenAKeywordAndATitle_WhenMatched_ThenWordsSharingTheirBeginningMatch(string specialization, string title, bool matches) =>
        SpecializationMatcher.Matches(SpecializationMatcher.Keywords(specialization), [title]).Should().Be(matches);
}
