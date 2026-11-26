using System.Text.Json;
using Mktba.Application.DTOs;
using Mktba.Domain.Entities;

namespace Mktba.Application.Services
{
    /// <summary>Builds, writes and reads the JSON snapshots stored in <see cref="ArticleRevision.Snapshot"/>.</summary>
    internal static class ArticleSnapshots
    {
        private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
        {
            Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() },
        };

        /// <summary>The article's working copy as a snapshot of the current schema version.</summary>
        public static ArticleSnapshotDto From(Article article)
        {
            var infoboxFields = article.InfoboxFields
                .OrderBy(f => f.Order)
                .Select(f => new ArticleSnapshotInfoboxFieldDto(f.Order, f.Key, f.Label, f.Value))
                .ToList();
            var infobox = article.InfoboxTitle is null && article.InfoboxSubtitle is null && infoboxFields.Count == 0
                ? null
                : new ArticleSnapshotInfoboxDto(article.InfoboxTitle, article.InfoboxSubtitle, infoboxFields);

            return new ArticleSnapshotDto(
                ArticleSnapshotDto.CurrentSchemaVersion,
                article.Title,
                article.Slug,
                article.Summary,
                ArticleTagAssigner.NamesOf(article),
                infobox,
                article.Paragraphs
                    .OrderBy(p => p.Order)
                    .Select(p => new ArticleSnapshotParagraphDto(
                        p.Order,
                        p.Opinions
                            .OrderBy(o => o.Id)
                            .Select(o => new ArticleSnapshotOpinionDto(
                                o.Content,
                                o.IsDefault,
                                o.OpinionSchools.Select(os => os.SchoolId).Order().ToList(),
                                o.Sources
                                    .OrderBy(c => c.Order)
                                    .ThenBy(c => c.Id)
                                    .Select(c => new ArticleSnapshotSourceDto(
                                        c.SourceId, c.Locator, c.Source.Kind, c.Source.Title, c.Source.Author, c.Source.Details, c.Source.Url))
                                    .ToList(),
                                o.Id))
                            .ToList(),
                        p.Id))
                    .ToList(),
                article.RelatedLinks
                    .OrderBy(l => l.Order)
                    .Select(l => new ArticleSnapshotRelatedLinkDto(l.RelatedArticleId, l.RelatedArticle.Title, l.RelatedArticle.Slug, l.Order))
                    .ToList(),
                ArticleSeo.From(article));
        }

        public static string Serialize(ArticleSnapshotDto snapshot) => JsonSerializer.Serialize(snapshot, Json);

        public static ArticleSnapshotDto Deserialize(string json)
            => JsonSerializer.Deserialize<ArticleSnapshotDto>(json, Json)
               ?? throw new InvalidOperationException("Revision snapshot is empty.");

        /// <summary>
        /// The snapshot as a full-replace update of the working copy. A paragraph the snapshot names by
        /// an id the working copy still has (<paramref name="existingParagraphIds"/>, version 4 on) is
        /// updated in place, and so are its opinions that are still there, so the remarks on them keep
        /// their block (V-06, #122); every other paragraph and opinion is new, and the current ones the
        /// snapshot does not name are dropped.
        /// </summary>
        public static ArticleContentDto ToUpdate(
            int articleId, ArticleSnapshotDto snapshot, string? editComment, IReadOnlySet<int>? existingParagraphIds = null)
            => new(
                articleId,
                snapshot.Title,
                snapshot.Paragraphs
                    .Select(p => new ParagraphDto
                    {
                        Id = p.Id is int id && existingParagraphIds?.Contains(id) == true ? id : 0,
                        Order = p.Order,
                        Opinions = p.Opinions
                            .Select(o => new OpinionDto
                            {
                                Id = p.Id is int kept && existingParagraphIds?.Contains(kept) == true ? o.Id ?? 0 : 0,
                                Content = o.Content,
                                IsDefault = o.IsDefault,
                                SchoolIds = o.SchoolIds.ToList(),
                                Sources = (o.Sources ?? []).Select(s => new OpinionSourceDto(s.SourceId, s.Locator)).ToList(),
                            })
                            .ToList(),
                    })
                    .ToList(),
                snapshot.Infobox is null
                    ? null
                    : new ArticleInfoboxDto(
                        snapshot.Infobox.Title,
                        snapshot.Infobox.Subtitle,
                        snapshot.Infobox.Fields.Select(f => new ArticleInfoboxFieldDto(0, f.Order, f.Key, f.Label, f.Value)).ToList()),
                snapshot.Summary,
                snapshot.Tags.ToList(),
                snapshot.RelatedLinks
                    .Select(l => new ArticleRelatedLinkDto(0, l.RelatedArticleId, l.RelatedArticleTitle, l.Order, l.RelatedArticleSlug))
                    .ToList(),
                snapshot.Slug,
                EditComment: editComment,
                Seo: snapshot.Seo);
    }
}
