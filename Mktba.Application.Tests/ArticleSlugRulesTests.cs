using FluentAssertions;
using Mktba.Application.Services;

namespace Mktba.Application.Tests;

/// <summary>M-01 (#22): how a title becomes a slug and what a valid slug is.</summary>
public class ArticleSlugRulesTests
{
    [Theory]
    [InlineData("Намаз", "namaz")]
    [InlineData("Ёлка и йогурт", "yolka-i-yogurt")]
    [InlineData("Щедрость", "shchedrost")]
    [InlineData("Объявление о подъёме", "obyavlenie-o-podyome")]
    [InlineData("Жизнь, Хадж и Цель!", "zhizn-khadzh-i-tsel")]
    [InlineData("Чтение Юности Ягнёнка", "chtenie-yunosti-yagnyonka")]
    [InlineData("Эра Ширка", "era-shirka")]
    [InlineData("Сура «Аль-Фатиха»", "sura-al-fatikha")]
    [InlineData("Hanafi фикх", "hanafi-fikkh")]
    [InlineData("Qur'an и ʿАраб", "quran-i-arab")]
    [InlineData("Ṣalāt al-Ẓuhr", "salat-al-zuhr")]
    [InlineData("  --Тема  —  2  --  ", "tema-2")]
    [InlineData("Шафиитский мазхаб 101", "shafiitskiy-mazkhab-101")]
    public void GivenTitle_WhenMakingSlug_ThenTransliteratesLowercasesAndHyphenates(string title, string expected)
    {
        ArticleSlugRules.FromTitle(title).Should().Be(expected);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("!?…—«»")]
    [InlineData("الصلاة")]
    [InlineData(null)]
    public void GivenTitleWithNothingToTransliterate_WhenMakingSlug_ThenReturnsFallback(string? title)
    {
        ArticleSlugRules.FromTitle(title).Should().Be(ArticleSlugRules.Fallback);
    }

    [Fact]
    public void GivenDigitsOnlyTitle_WhenMakingSlug_ThenPrefixesItSoItIsNotAnId()
    {
        ArticleSlugRules.FromTitle("1446").Should().Be("article-1446");
    }

    [Fact]
    public void GivenLongTitle_WhenMakingSlug_ThenTrimsToMaxLengthWithoutTrailingHyphen()
    {
        var title = string.Join(' ', Enumerable.Repeat("Слово", 40));

        var slug = ArticleSlugRules.FromTitle(title);

        slug.Length.Should().BeLessThanOrEqualTo(ArticleSlugRules.MaxLength);
        slug.Should().StartWith("slovo-slovo").And.NotEndWith("-");
        ArticleSlugRules.IsValid(slug).Should().BeTrue();
    }

    [Fact]
    public void GivenBaseSlug_WhenAddingSuffix_ThenFirstIsBaseThenNumbered()
    {
        ArticleSlugRules.WithSuffix("namaz", 1).Should().Be("namaz");
        ArticleSlugRules.WithSuffix("namaz", 2).Should().Be("namaz-2");
        ArticleSlugRules.WithSuffix("namaz", 13).Should().Be("namaz-13");
    }

    [Fact]
    public void GivenMaxLengthBase_WhenAddingSuffix_ThenStaysWithinMaxLength()
    {
        var baseSlug = new string('a', ArticleSlugRules.MaxLength);

        var slug = ArticleSlugRules.WithSuffix(baseSlug, 2);

        slug.Should().HaveLength(ArticleSlugRules.MaxLength).And.EndWith("-2");
    }

    [Theory]
    [InlineData("namaz", true)]
    [InlineData("sura-al-fatikha", true)]
    [InlineData("1-2", true)]
    [InlineData("article-1446", true)]
    [InlineData("1446", false)]
    [InlineData("", false)]
    [InlineData("Namaz", false)]
    [InlineData("намаз", false)]
    [InlineData("-namaz", false)]
    [InlineData("namaz-", false)]
    [InlineData("na--maz", false)]
    [InlineData("na maz", false)]
    [InlineData("na_maz", false)]
    public void GivenSlug_WhenValidating_ThenOnlyLowercaseLatinDigitsAndSingleHyphensPass(string slug, bool expected)
    {
        ArticleSlugRules.IsValid(slug).Should().Be(expected);
    }

    [Theory]
    [InlineData("admin", true)]
    [InlineData("search", true)]
    [InlineData("authors", true)]
    [InlineData("article", true)]
    [InlineData("sitemaps", true)]
    [InlineData("ru", true)]
    [InlineData("en", true)]
    [InlineData("search-2", false)]
    [InlineData("administratsiya", false)]
    [InlineData("namaz", false)]
    public void GivenSlug_WhenCheckingReserved_ThenOnlyTheSitesFirstSegmentsAreReserved(string slug, bool expected)
    {
        ArticleSlugRules.IsReserved(slug).Should().Be(expected);
    }

    [Fact]
    public void GivenTooLongSlug_WhenValidating_ThenFails()
    {
        ArticleSlugRules.IsValid(new string('a', ArticleSlugRules.MaxLength + 1)).Should().BeFalse();
    }
}
