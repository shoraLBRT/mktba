using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Application.Services.Verification;

/// <summary>A canonical school a review can be scoped to: its slug (the review's scope) and its id (the snapshot's).</summary>
public sealed record ReviewScopeSchool(string Slug, int Id);

/// <summary>
/// What counts as a substantial edit for a scholar's review (V-05, #121; decision D5, #115): a change
/// to the text the review covers. Each revision gets one <see cref="ArticleRevisionFingerprint"/> per
/// scope, the hash of that text; a review stays current while the latest revision has the same hash
/// for the review's scope as the reviewed one.
/// </summary>
/// <remarks>
/// Defaults chosen by the agent, open for the owner in #121. Covered — what the review page shows as
/// the article's text: the title, the infobox (title, subtitle, labels and values), the paragraphs in
/// order and, in each, the opinions' text, the schools they are linked to, which one is the default,
/// and their citations (the source and the locator; not the directory entry's own fields, which a
/// snapshot copies and an edit of the directory would change). Not covered: the slug, the summary,
/// the tags, the SEO fields, the related links, the edit comment. A change in whitespace only (runs of
/// spaces and line breaks, non-breaking spaces, whitespace next to a tag) is not substantial, nor is
/// the order of the opinions in a block. With a school, the scope is what readers of that school see
/// (the client's <c>scopeSnapshot</c>): a paragraph common to all schools, and in a block of opinions
/// only the school's opinion or the default one — so an edit of another school's opinion, or of which
/// schools the opinions are linked to that leaves the chosen text alone, keeps that school's reviews current.
/// </remarks>
public static partial class ReviewFingerprints
{
    /// <summary>The fingerprints of a revision: the whole article and each of <paramref name="schools"/>.</summary>
    public static List<ArticleRevisionFingerprint> For(ArticleSnapshotDto snapshot, IEnumerable<ReviewScopeSchool> schools)
    {
        var fingerprints = new List<ArticleRevisionFingerprint>
        {
            new() { Scope = ArticleRevisionFingerprint.WholeArticle, Hash = Hash(snapshot, null) },
        };
        fingerprints.AddRange(schools.Select(school => new ArticleRevisionFingerprint { Scope = school.Slug, Hash = Hash(snapshot, school.Id) }));
        return fingerprints;
    }

    /// <summary>The hash of what a review with the school <paramref name="schoolId"/> (null: the whole article) covers.</summary>
    public static string Hash(ArticleSnapshotDto snapshot, int? schoolId)
    {
        var covered = new
        {
            title = Text(snapshot.Title),
            infobox = snapshot.Infobox is null
                ? null
                : new
                {
                    title = Text(snapshot.Infobox.Title),
                    subtitle = Text(snapshot.Infobox.Subtitle),
                    fields = snapshot.Infobox.Fields.OrderBy(field => field.Order).Select(field => new[] { Text(field.Label), Text(field.Value) }),
                },
            paragraphs = snapshot.Paragraphs.OrderBy(paragraph => paragraph.Order).Select(paragraph => Paragraph(paragraph, schoolId)),
        };
        var json = JsonSerializer.SerializeToUtf8Bytes(covered);
        return Convert.ToHexString(SHA256.HashData(json)).ToLowerInvariant();
    }

    /// <summary>The scope a review with this school keeps: <see cref="ArticleReview.Mazhab"/>, or the whole article.</summary>
    public static string ScopeOf(string? mazhab) => mazhab ?? ArticleRevisionFingerprint.WholeArticle;

    private static IEnumerable<object> Paragraph(ArticleSnapshotParagraphDto paragraph, int? schoolId)
    {
        if (schoolId is int id && paragraph.Opinions.Count > 1)
        {
            var chosen = paragraph.Opinions.FirstOrDefault(opinion => opinion.SchoolIds.Contains(id))
                ?? paragraph.Opinions.FirstOrDefault(opinion => opinion.IsDefault)
                ?? paragraph.Opinions[0];
            return [new { content = Text(chosen.Content), sources = Sources(chosen) }];
        }

        if (schoolId is not null)
        {
            return paragraph.Opinions.Select(opinion => new { content = Text(opinion.Content), sources = Sources(opinion) });
        }

        return paragraph.Opinions
            .Select(opinion => new
            {
                content = Text(opinion.Content),
                isDefault = opinion.IsDefault,
                schools = opinion.SchoolIds.Order().ToList(),
                sources = Sources(opinion),
            })
            .OrderBy(opinion => string.Join(",", opinion.schools), StringComparer.Ordinal)
            .ThenBy(opinion => opinion.content, StringComparer.Ordinal);
    }

    private static IEnumerable<string> Sources(ArticleSnapshotOpinionDto opinion) =>
        (opinion.Sources ?? []).Select(source => $"{source.SourceId}|{Text(source.Locator)}");

    /// <summary>The text with whitespace-only differences removed.</summary>
    private static string Text(string? value)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        var text = value.Replace("&nbsp;", " ", StringComparison.OrdinalIgnoreCase).Replace('\u00A0', ' ');
        text = Whitespace().Replace(text, " ");
        text = AroundTag().Replace(text, "$1");
        return text.Trim();
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    [GeneratedRegex(@"\s*(<[^>]*>)\s*")]
    private static partial Regex AroundTag();
}
