using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <summary>
    /// I-10 (#114): search stems words by the article's language instead of always by Russian.
    /// Like <c>AddArticleSearch</c>, everything here lives only in the database:
    /// <list type="bullet">
    /// <item><c>mktba_search_config(text)</c> — the one place a locale code maps to a PostgreSQL
    /// text search configuration (<c>en</c> → <c>english</c>, anything else → <c>russian</c>). A new
    /// language adds a branch here in a new migration, which must also rebuild both vectors;</item>
    /// <item><c>"Articles"."SearchVector"</c> — still a stored generated column, now built with the
    /// configuration of the row's own <c>"Locale"</c>;</item>
    /// <item><c>"Opinions"."SearchVector"</c> — an opinion does not store its language, and a generated
    /// column cannot read another table, so it becomes a plain column that the trigger
    /// <c>mktba_opinion_search_vector</c> fills on every insert and on every change of the text or
    /// paragraph, with the configuration of the article the paragraph belongs to. An article's locale
    /// never changes after it is created, so the vector cannot go stale.</item>
    /// </list>
    /// </summary>
    public partial class LocalizeArticleSearch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE FUNCTION mktba_search_config(locale text) RETURNS regconfig
                LANGUAGE sql IMMUTABLE PARALLEL SAFE
                AS $$
                    SELECT CASE locale WHEN 'en' THEN 'pg_catalog.english'::regconfig ELSE 'pg_catalog.russian'::regconfig END
                $$;
                """);

            migrationBuilder.Sql("""DROP INDEX "IX_Articles_SearchVector";""");
            migrationBuilder.Sql("""ALTER TABLE "Articles" DROP COLUMN "SearchVector";""");
            migrationBuilder.Sql("""
                ALTER TABLE "Articles" ADD COLUMN "SearchVector" tsvector
                GENERATED ALWAYS AS (
                    setweight(to_tsvector(mktba_search_config("Locale"), translate("Title", 'ёЁ', 'еЕ')), 'A')
                    || setweight(to_tsvector(mktba_search_config("Locale"), translate(
                        coalesce("Summary", '') || ' ' || replace(coalesce("Tags", ''), ',', ' , '), 'ёЁ', 'еЕ')), 'B')
                ) STORED;
                """);
            migrationBuilder.Sql("""CREATE INDEX "IX_Articles_SearchVector" ON "Articles" USING GIN ("SearchVector");""");

            migrationBuilder.Sql("""DROP INDEX "IX_Opinions_SearchVector";""");
            migrationBuilder.Sql("""ALTER TABLE "Opinions" DROP COLUMN "SearchVector";""");
            migrationBuilder.Sql("""ALTER TABLE "Opinions" ADD COLUMN "SearchVector" tsvector NOT NULL DEFAULT ''::tsvector;""");
            migrationBuilder.Sql("""
                CREATE FUNCTION mktba_opinion_search_vector() RETURNS trigger
                LANGUAGE plpgsql
                AS $$
                BEGIN
                    NEW."SearchVector" := setweight(to_tsvector(
                        mktba_search_config((
                            SELECT a."Locale" FROM "Paragraphs" p
                            JOIN "Articles" a ON a."Id" = p."ArticleId"
                            WHERE p."Id" = NEW."ParagraphId")),
                        translate(coalesce(mktba_search_plain_text(NEW."Content"), ''), 'ёЁ', 'еЕ')), 'D');
                    RETURN NEW;
                END
                $$;
                """);
            migrationBuilder.Sql("""
                CREATE TRIGGER mktba_opinion_search_vector
                BEFORE INSERT OR UPDATE OF "Content", "ParagraphId" ON "Opinions"
                FOR EACH ROW EXECUTE FUNCTION mktba_opinion_search_vector();
                """);
            // Fires the trigger for the existing rows.
            migrationBuilder.Sql("""UPDATE "Opinions" SET "Content" = "Content";""");
            migrationBuilder.Sql("""CREATE INDEX "IX_Opinions_SearchVector" ON "Opinions" USING GIN ("SearchVector");""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""DROP INDEX "IX_Opinions_SearchVector";""");
            migrationBuilder.Sql("""DROP TRIGGER mktba_opinion_search_vector ON "Opinions";""");
            migrationBuilder.Sql("DROP FUNCTION mktba_opinion_search_vector();");
            migrationBuilder.Sql("""ALTER TABLE "Opinions" DROP COLUMN "SearchVector";""");
            migrationBuilder.Sql("""
                ALTER TABLE "Opinions" ADD COLUMN "SearchVector" tsvector
                GENERATED ALWAYS AS (
                    setweight(to_tsvector('russian'::regconfig, translate(mktba_search_plain_text("Content"), 'ёЁ', 'еЕ')), 'D')
                ) STORED;
                """);
            migrationBuilder.Sql("""CREATE INDEX "IX_Opinions_SearchVector" ON "Opinions" USING GIN ("SearchVector");""");

            migrationBuilder.Sql("""DROP INDEX "IX_Articles_SearchVector";""");
            migrationBuilder.Sql("""ALTER TABLE "Articles" DROP COLUMN "SearchVector";""");
            migrationBuilder.Sql("""
                ALTER TABLE "Articles" ADD COLUMN "SearchVector" tsvector
                GENERATED ALWAYS AS (
                    setweight(to_tsvector('russian'::regconfig, translate("Title", 'ёЁ', 'еЕ')), 'A')
                    || setweight(to_tsvector('russian'::regconfig, translate(
                        coalesce("Summary", '') || ' ' || replace(coalesce("Tags", ''), ',', ' , '), 'ёЁ', 'еЕ')), 'B')
                ) STORED;
                """);
            migrationBuilder.Sql("""CREATE INDEX "IX_Articles_SearchVector" ON "Articles" USING GIN ("SearchVector");""");

            migrationBuilder.Sql("DROP FUNCTION mktba_search_config(text);");
        }
    }
}
