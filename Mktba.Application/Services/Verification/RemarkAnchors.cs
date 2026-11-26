using System.Net;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Application.Services.Verification;

/// <summary>
/// How a remark finds its block (V-06, #122): the ids of the paragraphs and opinions of a revision's
/// snapshot, and the block's text kept with the remark.
/// </summary>
internal static partial class RemarkAnchors
{
    /// <summary>A paragraph of the working copy with its opinions' ids in the snapshot's order (by id).</summary>
    public sealed record LiveParagraph(int Id, int Order, List<int> OpinionIds);

    public static async Task<List<LiveParagraph>> LiveParagraphsAsync(MktbaDbContext db, int articleId, CancellationToken cancellationToken)
    {
        var rows = await db.Paragraphs.AsNoTracking()
            .Where(paragraph => paragraph.ArticleId == articleId)
            .Select(paragraph => new { paragraph.Id, paragraph.Order, Opinions = paragraph.Opinions.Select(opinion => opinion.Id).ToList() })
            .ToListAsync(cancellationToken);
        return rows.Select(row => new LiveParagraph(row.Id, row.Order, row.Opinions.Order().ToList())).ToList();
    }

    /// <summary>
    /// The snapshot with the ids of its blocks. A snapshot of version 4 on has them; in an older one a
    /// paragraph takes the id of the working copy's paragraph at the same position with as many
    /// opinions (the revision a scholar reads is the latest one, which the working copy normally
    /// matches), and stays without an id — no remark can be made on it — when there is none.
    /// </summary>
    public static ArticleSnapshotDto WithIds(ArticleSnapshotDto snapshot, IReadOnlyList<LiveParagraph> live)
    {
        if (snapshot.Paragraphs.All(paragraph => paragraph.Id is not null))
        {
            return snapshot;
        }

        var byOrder = live.GroupBy(paragraph => paragraph.Order).ToDictionary(group => group.Key, group => group.First());
        var paragraphs = snapshot.Paragraphs
            .Select(paragraph =>
            {
                if (paragraph.Id is not null
                    || !byOrder.TryGetValue(paragraph.Order, out var match)
                    || match.OpinionIds.Count != paragraph.Opinions.Count)
                {
                    return paragraph;
                }

                return paragraph with
                {
                    Id = match.Id,
                    Opinions = paragraph.Opinions.Select((opinion, index) => opinion with { Id = match.OpinionIds[index] }).ToList(),
                };
            })
            .ToList();
        return snapshot with { Paragraphs = paragraphs };
    }

    /// <summary>The block's text as plain text: tags dropped, entities decoded, white space collapsed, cut to the excerpt's length.</summary>
    public static string Excerpt(IEnumerable<string> contents)
    {
        var text = string.Join(" · ", contents
            .Select(content => Whitespace().Replace(WebUtility.HtmlDecode(Tag().Replace(content, " ")), " ").Trim())
            .Where(part => part.Length > 0));
        return text.Length <= ArticleRemark.ExcerptMaxLength
            ? text
            : string.Concat(text.AsSpan(0, ArticleRemark.ExcerptMaxLength - 1).TrimEnd(), "…");
    }

    [GeneratedRegex("<[^>]*>")]
    private static partial Regex Tag();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}
