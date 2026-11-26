using FluentAssertions;
using Mktba.Application.DTOs;
using Mktba.Application.Services.Verification;
using Mktba.Domain.Entities;

namespace Mktba.Application.Tests;

/// <summary>V-05 (#121): which edits are substantial for a scholar's review.</summary>
public sealed class ReviewFingerprintsTests
{
    private const int Hanafi = 1;
    private const int Shafii = 3;

    private static readonly ArticleSnapshotDto Base = new(
        ArticleSnapshotDto.CurrentSchemaVersion,
        "Намаз путника",
        "namaz-putnika",
        "Кратко о сокращении намаза.",
        ["намаз"],
        new ArticleSnapshotInfoboxDto("Намаз", null, [new ArticleSnapshotInfoboxFieldDto(1, "rakats", "Ракаатов", "2")]),
        [
            new ArticleSnapshotParagraphDto(1, [new ArticleSnapshotOpinionDto("<p>Путник сокращает намаз.</p>", true, [])]),
            new ArticleSnapshotParagraphDto(2,
            [
                new ArticleSnapshotOpinionDto("<p>Ханафиты: обязательно.</p>", true, [Hanafi],
                    [new ArticleSnapshotSourceDto(7, "т. 1, с. 10", SourceKind.Book, "Хидая", null, null, null)]),
                new ArticleSnapshotOpinionDto("<p>Шафииты: желательно.</p>", false, [Shafii]),
            ]),
        ],
        [new ArticleSnapshotRelatedLinkDto(5, "Намаз", "namaz", 1)],
        new ArticleSeoDto("SEO", null, null, false));

    public static TheoryData<string, Func<ArticleSnapshotDto, ArticleSnapshotDto>> NotSubstantial => new()
    {
        { "tags", s => s with { Tags = ["намаз", "путник"] } },
        { "slug", s => s with { Slug = "novyi" } },
        { "summary", s => s with { Summary = "Иначе." } },
        { "seo", s => s with { Seo = null } },
        { "related links", s => s with { RelatedLinks = [] } },
        { "whitespace", s => s with { Title = "  Намаз   путника ", Paragraphs = [WithContent(s.Paragraphs[0], "<p>\n  Путник&nbsp;сокращает намаз. </p>\n"), s.Paragraphs[1]] } },
        { "opinion order", s => s with { Paragraphs = [s.Paragraphs[0], s.Paragraphs[1] with { Opinions = [s.Paragraphs[1].Opinions[1], s.Paragraphs[1].Opinions[0]] }] } },
        { "source directory fields", s => s with { Paragraphs = [s.Paragraphs[0], s.Paragraphs[1] with { Opinions = [s.Paragraphs[1].Opinions[0] with { Sources = [new(7, "т. 1, с. 10", SourceKind.Book, "Аль-Хидая", "Маргинани", null, null)] }, s.Paragraphs[1].Opinions[1]] }] } },
    };

    public static TheoryData<string, Func<ArticleSnapshotDto, ArticleSnapshotDto>> Substantial => new()
    {
        { "title", s => s with { Title = "Намаз в пути" } },
        { "infobox value", s => s with { Infobox = s.Infobox! with { Fields = [new(1, "rakats", "Ракаатов", "4")] } } },
        { "a word", s => s with { Paragraphs = [WithContent(s.Paragraphs[0], "<p>Путник не сокращает намаз.</p>"), s.Paragraphs[1]] } },
        { "a heading", s => s with { Paragraphs = [WithContent(s.Paragraphs[0], "<h2>Путник</h2><p>Путник сокращает намаз.</p>"), s.Paragraphs[1]] } },
        { "paragraph order", s => s with { Paragraphs = [s.Paragraphs[1] with { Order = 1 }, s.Paragraphs[0] with { Order = 2 }] } },
        { "a new paragraph", s => s with { Paragraphs = [.. s.Paragraphs, new ArticleSnapshotParagraphDto(3, [new ArticleSnapshotOpinionDto("<p>Ещё.</p>", true, [])])] } },
        { "a citation", s => s with { Paragraphs = [s.Paragraphs[0], s.Paragraphs[1] with { Opinions = [s.Paragraphs[1].Opinions[0] with { Sources = [new(7, "т. 2", SourceKind.Book, "Хидая", null, null, null)] }, s.Paragraphs[1].Opinions[1]] }] } },
    };

    [Theory]
    [MemberData(nameof(NotSubstantial))]
    public void GivenAnEditOutsideTheReviewedText_WhenFingerprinted_ThenEveryScopeKeepsItsHash(string edit, Func<ArticleSnapshotDto, ArticleSnapshotDto> change)
    {
        var edited = change(Base);

        foreach (var school in new int?[] { null, Hanafi, Shafii })
        {
            ReviewFingerprints.Hash(edited, school).Should().Be(ReviewFingerprints.Hash(Base, school), $"{edit} is not substantial (school {school})");
        }
    }

    [Theory]
    [MemberData(nameof(Substantial))]
    public void GivenAnEditOfTheReviewedText_WhenFingerprinted_ThenTheWholeArticleHashChanges(string edit, Func<ArticleSnapshotDto, ArticleSnapshotDto> change)
    {
        ReviewFingerprints.Hash(change(Base), null).Should().NotBe(ReviewFingerprints.Hash(Base, null), $"{edit} is substantial");
    }

    [Fact]
    public void GivenAnEditOfOneSchoolsOpinion_WhenFingerprinted_ThenOnlyThatSchoolAndTheWholeArticleChange()
    {
        var edited = Base with
        {
            Paragraphs = [Base.Paragraphs[0], Base.Paragraphs[1] with { Opinions = [Base.Paragraphs[1].Opinions[0], Base.Paragraphs[1].Opinions[1] with { Content = "<p>Шафииты: обязательно.</p>" }] }],
        };

        ReviewFingerprints.Hash(edited, Hanafi).Should().Be(ReviewFingerprints.Hash(Base, Hanafi));
        ReviewFingerprints.Hash(edited, Shafii).Should().NotBe(ReviewFingerprints.Hash(Base, Shafii));
        ReviewFingerprints.Hash(edited, null).Should().NotBe(ReviewFingerprints.Hash(Base, null));
        // A school without its own opinion reads the default one, which this edit leaves alone.
        ReviewFingerprints.Hash(edited, 2).Should().Be(ReviewFingerprints.Hash(Base, 2));
    }

    [Fact]
    public void GivenARevision_WhenItsFingerprintsAreBuilt_ThenThereIsOneForTheWholeArticleAndOnePerSchool()
    {
        var fingerprints = ReviewFingerprints.For(Base, [new ReviewScopeSchool("hanafi", Hanafi), new ReviewScopeSchool("shafii", Shafii)]);

        fingerprints.Select(f => f.Scope).Should().Equal(ArticleRevisionFingerprint.WholeArticle, "hanafi", "shafii");
        fingerprints.Should().OnlyContain(f => f.Hash.Length == ArticleRevisionFingerprint.HashLength);
        ReviewFingerprints.ScopeOf(null).Should().Be(ArticleRevisionFingerprint.WholeArticle);
    }

    private static ArticleSnapshotParagraphDto WithContent(ArticleSnapshotParagraphDto paragraph, string content) =>
        paragraph with { Opinions = [paragraph.Opinions[0] with { Content = content }] };
}
