using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Application.Services;

namespace Mktba.Application.Tests;

/// <summary>U-07 (#72): the pure rules of a user profile.</summary>
public class UserProfileRulesTests
{
    private static UserProfileWriteDto Profile(
        string? displayName = "Иван Иванов",
        string? slug = null,
        string? avatarUrl = null,
        string? bio = null,
        string? degree = null,
        string? institution = null,
        List<ProfileLinkDto>? links = null)
        => new(displayName, slug, avatarUrl, bio, degree, institution, links);

    private static string? CodeOf(UserProfileWriteDto profile)
        => UserProfileRules.Check(UserProfileRules.Normalize(profile))?.Code;

    [Fact]
    public void GivenPaddedAndBlankValues_WhenNormalizing_ThenTrimsAndTurnsBlanksIntoNull()
    {
        var normalized = UserProfileRules.Normalize(Profile(
            displayName: "  Иван Иванов ",
            slug: " Ivan-Ivanov ",
            avatarUrl: "   ",
            bio: "строка один\r\nстрока два",
            degree: "",
            links: [new ProfileLinkDto("  Сайт ", " https://example.com/me ")]));

        normalized.DisplayName.Should().Be("Иван Иванов");
        normalized.Slug.Should().Be("ivan-ivanov");
        normalized.AvatarUrl.Should().BeNull();
        normalized.Bio.Should().Be("строка один\nстрока два");
        normalized.Degree.Should().BeNull();
        normalized.Links.Should().Equal(new ProfileLinkDto("Сайт", "https://example.com/me"));
    }

    [Fact]
    public void GivenNoProfileAtAll_WhenNormalizing_ThenEverythingIsEmptyAndValid()
    {
        var normalized = UserProfileRules.Normalize(null);

        normalized.DisplayName.Should().BeNull();
        normalized.Links.Should().BeEmpty();
        UserProfileRules.Check(normalized).Should().BeNull();
    }

    [Fact]
    public void GivenFullValidProfile_WhenChecking_ThenThereIsNoError()
    {
        CodeOf(Profile(
            slug: "ivan-ivanov",
            avatarUrl: "/media/ivan.png",
            bio: new string('б', 1000),
            degree: new string('д', 150),
            institution: new string('у', 200),
            links: Enumerable.Range(1, 5).Select(n => new ProfileLinkDto($"Ссылка {n}", $"https://example.com/{n}")).ToList()))
            .Should().BeNull();
    }

    [Theory]
    [InlineData("Иван\nИванов")]
    [InlineData("Иван\tИванов")]
    public void GivenDisplayNameWithControlCharacters_WhenChecking_ThenItIsInvalid(string name)
    {
        CodeOf(Profile(displayName: name)).Should().Be("profile_display_name_invalid");
    }

    [Fact]
    public void GivenTooLongDisplayName_WhenChecking_ThenItIsInvalid()
    {
        CodeOf(Profile(displayName: new string('и', 101))).Should().Be("profile_display_name_invalid");
    }

    [Fact]
    public void GivenSlugWithoutDisplayName_WhenChecking_ThenDisplayNameIsRequired()
    {
        CodeOf(Profile(displayName: " ", slug: "ivan")).Should().Be("profile_display_name_required");
    }

    [Theory]
    [InlineData("иван")]
    [InlineData("ivan--ivanov")]
    [InlineData("-ivan")]
    [InlineData("12345")]
    [InlineData("ivan ivanov")]
    public void GivenMalformedSlug_WhenChecking_ThenItIsInvalid(string slug)
    {
        CodeOf(Profile(slug: slug)).Should().Be("profile_slug_invalid");
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("//evil.example/a.png")]
    [InlineData("ftp://example.com/a.png")]
    [InlineData("data:image/png;base64,AAAA")]
    public void GivenAvatarThatIsNotHttpOrSitePath_WhenChecking_ThenItIsInvalid(string avatarUrl)
    {
        CodeOf(Profile(avatarUrl: avatarUrl)).Should().Be("profile_avatar_url_invalid");
    }

    [Fact]
    public void GivenTooLongTexts_WhenChecking_ThenEachHasItsOwnCode()
    {
        CodeOf(Profile(bio: new string('б', 1001))).Should().Be("profile_bio_too_long");
        CodeOf(Profile(degree: new string('д', 151))).Should().Be("profile_degree_too_long");
        CodeOf(Profile(institution: new string('у', 201))).Should().Be("profile_institution_too_long");
    }

    [Fact]
    public void GivenSixLinks_WhenChecking_ThenThereAreTooMany()
    {
        var links = Enumerable.Range(1, 6).Select(n => new ProfileLinkDto($"Ссылка {n}", $"https://example.com/{n}")).ToList();

        CodeOf(Profile(links: links)).Should().Be("profile_links_too_many");
    }

    [Fact]
    public void GivenLinkWithoutLabelOrWithTooLongOne_WhenChecking_ThenLabelIsInvalid()
    {
        CodeOf(Profile(links: [new ProfileLinkDto(" ", "https://example.com")])).Should().Be("profile_link_label_invalid");
        CodeOf(Profile(links: [new ProfileLinkDto(new string('я', 61), "https://example.com")])).Should().Be("profile_link_label_invalid");
    }

    [Theory]
    [InlineData("")]
    [InlineData("/relative/path")]
    [InlineData("javascript:alert(1)")]
    [InlineData("mailto:someone@example.com")]
    [InlineData("https://exa mple.com")]
    [InlineData("example.com")]
    public void GivenLinkThatIsNotAbsoluteHttp_WhenChecking_ThenUrlIsInvalid(string url)
    {
        CodeOf(Profile(links: [new ProfileLinkDto("Сайт", url)])).Should().Be("profile_link_url_invalid");
    }

    [Theory]
    [InlineData("Иван Иванов", "ivan-ivanov")]
    [InlineData("ʿАбдуллах аль-Фулян", "abdullakh-al-fulyan")]
    [InlineData("محمد", "author")]
    [InlineData("1446", "author-1446")]
    public void GivenDisplayName_WhenMakingSlug_ThenUsesTheArticleTransliterationWithItsOwnFallback(string name, string expected)
    {
        UserProfileRules.SlugFromName(name).Should().Be(expected);
    }
}
