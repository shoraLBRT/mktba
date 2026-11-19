using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;
using Mktba.Infrastructure.Data;

namespace Mktba.Infrastructure.Repositories
{
    /// <summary>
    /// One row of a search page. <see cref="Total"/> is the number of matching articles and is set on
    /// every row; a page past the end comes back as a single row with only <see cref="Total"/>.
    /// The text columns carry <see cref="ArticleSearchRepository.MatchStart"/> /
    /// <see cref="ArticleSearchRepository.MatchEnd"/> around the matched words.
    /// </summary>
    public sealed class ArticleSearchRow
    {
        public int Total { get; init; }
        public int? Id { get; init; }
        public string? Slug { get; init; }
        public string? Title { get; init; }
        public string? Summary { get; init; }

        /// <summary>Fragments of the best matching opinion as plain text; null when only the title, summary or tags matched.</summary>
        public string? Snippet { get; init; }

        /// <summary>The paragraph <see cref="Snippet"/> comes from.</summary>
        public int? ParagraphId { get; init; }
    }

    /// <summary>
    /// PostgreSQL full-text search over articles (R-10, #46). Reads the <c>SearchVector</c> columns and
    /// the SQL functions the <c>AddArticleSearch</c> migration creates; they are not part of the EF
    /// model, so this works only on PostgreSQL.
    /// </summary>
    public class ArticleSearchRepository
    {
        /// <summary>Marks the start of a matched word in the row's text columns (a private-use character, removed from the source text).</summary>
        public const char MatchStart = '';

        /// <summary>Marks the end of a matched word.</summary>
        public const char MatchEnd = '';

        private const string TextSearchConfiguration = "russian";

        private static readonly string Markers = $"{MatchStart}{MatchEnd}";

        private static readonly string WholeTextOptions = $"HighlightAll=true, StartSel={MatchStart}, StopSel={MatchEnd}";

        private static readonly string FragmentOptions =
            $"MaxFragments=2, MaxWords=24, MinWords=10, FragmentDelimiter=\" … \", StartSel={MatchStart}, StopSel={MatchEnd}";

        private readonly MktbaDbContext _context;

        public ArticleSearchRepository(MktbaDbContext context)
        {
            _context = context;
        }

        /// <summary>
        /// One page of the articles of <paramref name="locale"/> an anonymous reader can reach
        /// (Published, with every ancestor Published) whose title, summary, tags and opinion texts
        /// together hold every word of <paramref name="foldedQuery"/>, best match first.
        /// </summary>
        /// <param name="foldedQuery">The reader's words with ё folded to е, as the vectors are built.</param>
        /// <param name="rawQuery">The words as typed: used only to mark matches in text that keeps its ё.</param>
        /// <param name="locale">A supported locale code.</param>
        /// <param name="skip">Matching articles to skip.</param>
        /// <param name="take">Page size.</param>
        public Task<List<ArticleSearchRow>> SearchAsync(
            string foldedQuery, string rawQuery, string locale, int skip, int take, CancellationToken cancellationToken = default)
        {
            var published = ArticleStatus.Published.ToString();

            // The indexes find the articles holding any of the words in one of their rows (the article
            // or an opinion); the words may be spread over the title and several opinions, so the
            // "every word" test runs on the article's rows put together.
            return _context.Database
                .SqlQuery<ArticleSearchRow>($"""
                    WITH RECURSIVE reachable AS (
                        SELECT a."Id" FROM "Articles" a
                        WHERE a."ParentArticleId" IS NULL AND a."Status" = {published}
                        UNION
                        SELECT a."Id" FROM "Articles" a
                        JOIN reachable r ON a."ParentArticleId" = r."Id"
                        WHERE a."Status" = {published}
                    ),
                    q AS (
                        SELECT plainto_tsquery({TextSearchConfiguration}::regconfig, {foldedQuery}) AS all_terms,
                            replace(plainto_tsquery({TextSearchConfiguration}::regconfig, {foldedQuery})::text, ' & ', ' | ')::tsquery AS any_term,
                            replace(plainto_tsquery({TextSearchConfiguration}::regconfig, {foldedQuery} || ' ' || {rawQuery})::text, ' & ', ' | ')::tsquery AS marks
                    ),
                    candidates AS (
                        SELECT a."Id" FROM "Articles" a CROSS JOIN q
                        WHERE a."SearchVector" @@ q.any_term
                        UNION
                        SELECT p."ArticleId" FROM "Opinions" o
                        JOIN "Paragraphs" p ON p."Id" = o."ParagraphId"
                        CROSS JOIN q
                        WHERE o."SearchVector" @@ q.any_term
                    ),
                    documents AS (
                        SELECT a."Id", a."Slug", a."Title", a."Summary",
                            a."SearchVector" || coalesce((
                                SELECT mktba_tsvector_agg(o."SearchVector" ORDER BY p."Order", o."Id")
                                FROM "Opinions" o
                                JOIN "Paragraphs" p ON p."Id" = o."ParagraphId"
                                WHERE p."ArticleId" = a."Id"), ''::tsvector) AS "Document"
                        FROM "Articles" a
                        WHERE a."Locale" = {locale}
                            AND a."Id" IN (SELECT c."Id" FROM candidates c)
                            AND a."Id" IN (SELECT r."Id" FROM reachable r)
                    ),
                    matched AS (
                        SELECT d."Id", d."Slug", d."Title", d."Summary", ts_rank(d."Document", q.all_terms) AS "Rank"
                        FROM documents d CROSS JOIN q
                        WHERE d."Document" @@ q.all_terms
                    ),
                    page AS (
                        SELECT m.* FROM matched m ORDER BY m."Rank" DESC, m."Id" LIMIT {take} OFFSET {skip}
                    )
                    SELECT t."Total",
                        pg."Id",
                        pg."Slug",
                        ts_headline({TextSearchConfiguration}::regconfig,
                            translate(pg."Title", {Markers}, ''), q.marks, {WholeTextOptions}) AS "Title",
                        CASE WHEN btrim(coalesce(pg."Summary", '')) <> '' THEN
                            ts_headline({TextSearchConfiguration}::regconfig,
                                translate(pg."Summary", {Markers}, ''), q.marks, {WholeTextOptions})
                        END AS "Summary",
                        CASE WHEN best."Content" IS NOT NULL THEN
                            ts_headline({TextSearchConfiguration}::regconfig,
                                mktba_search_plain_text(best."Content"), q.marks, {FragmentOptions})
                        END AS "Snippet",
                        best."ParagraphId"
                    FROM (SELECT count(*)::int AS "Total" FROM matched) t
                    CROSS JOIN q
                    LEFT JOIN page pg ON true
                    LEFT JOIN LATERAL (
                        SELECT o."Content", p."Id" AS "ParagraphId"
                        FROM "Opinions" o
                        JOIN "Paragraphs" p ON p."Id" = o."ParagraphId"
                        WHERE p."ArticleId" = pg."Id" AND o."SearchVector" @@ q.any_term
                        ORDER BY ts_rank(o."SearchVector", q.any_term) DESC, o."IsDefault" DESC, p."Order", o."Id"
                        LIMIT 1
                    ) best ON true
                    ORDER BY pg."Rank" DESC, pg."Id"
                    """)
                .ToListAsync(cancellationToken);
        }
    }
}
