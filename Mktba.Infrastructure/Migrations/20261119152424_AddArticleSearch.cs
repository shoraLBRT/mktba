using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <summary>
    /// R-10 (#46): full-text search. Everything here lives only in the database — the EF model does
    /// not map it, and <c>ArticleSearchRepository</c> reads it with SQL:
    /// <list type="bullet">
    /// <item><c>mktba_search_plain_text(text)</c> — Markdown/HTML to the text a reader sees (link
    /// targets, tags and markup characters removed);</item>
    /// <item><c>mktba_tsvector_agg(tsvector)</c> — concatenates the vectors of an article's opinions;</item>
    /// <item><c>"Articles"."SearchVector"</c> — stored generated column: title (weight A), summary and
    /// tags (weight B), <c>russian</c> configuration, ё folded to е;</item>
    /// <item><c>"Opinions"."SearchVector"</c> — stored generated column: the opinion's text (weight D);</item>
    /// <item>a GIN index on each.</item>
    /// </list>
    /// Adding a stored generated column rewrites the table and fills it for the existing rows, so
    /// there is no separate backfill; PostgreSQL keeps both columns current on every write.
    /// </summary>
    public partial class AddArticleSearch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE FUNCTION mktba_search_plain_text(source text) RETURNS text
                LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
                AS $$
                    SELECT btrim(regexp_replace(
                        regexp_replace(
                            regexp_replace(
                                regexp_replace(
                                    translate(source, U&'\E000\E001', ''),
                                    '!?\[([^]]*)\]\([^)]*\)', '\1', 'g'),
                                '<[^>]*>', ' ', 'g'),
                            '[*_`~#|]+|\\+|^\s*>+', ' ', 'gn'),
                        '\s+', ' ', 'g'))
                $$;
                """);

            migrationBuilder.Sql("""
                CREATE AGGREGATE mktba_tsvector_agg(tsvector) (
                    SFUNC = tsvector_concat,
                    STYPE = tsvector,
                    INITCOND = ''
                );
                """);

            migrationBuilder.Sql("""
                ALTER TABLE "Articles" ADD COLUMN "SearchVector" tsvector
                GENERATED ALWAYS AS (
                    setweight(to_tsvector('russian'::regconfig, translate("Title", 'ёЁ', 'еЕ')), 'A')
                    || setweight(to_tsvector('russian'::regconfig, translate(
                        coalesce("Summary", '') || ' ' || replace(coalesce("Tags", ''), ',', ' , '), 'ёЁ', 'еЕ')), 'B')
                ) STORED;
                """);

            migrationBuilder.Sql("""
                ALTER TABLE "Opinions" ADD COLUMN "SearchVector" tsvector
                GENERATED ALWAYS AS (
                    setweight(to_tsvector('russian'::regconfig, translate(mktba_search_plain_text("Content"), 'ёЁ', 'еЕ')), 'D')
                ) STORED;
                """);

            migrationBuilder.Sql("""CREATE INDEX "IX_Articles_SearchVector" ON "Articles" USING GIN ("SearchVector");""");
            migrationBuilder.Sql("""CREATE INDEX "IX_Opinions_SearchVector" ON "Opinions" USING GIN ("SearchVector");""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""DROP INDEX "IX_Opinions_SearchVector";""");
            migrationBuilder.Sql("""DROP INDEX "IX_Articles_SearchVector";""");
            migrationBuilder.Sql("""ALTER TABLE "Opinions" DROP COLUMN "SearchVector";""");
            migrationBuilder.Sql("""ALTER TABLE "Articles" DROP COLUMN "SearchVector";""");
            migrationBuilder.Sql("DROP AGGREGATE mktba_tsvector_agg(tsvector);");
            migrationBuilder.Sql("DROP FUNCTION mktba_search_plain_text(text);");
        }
    }
}
