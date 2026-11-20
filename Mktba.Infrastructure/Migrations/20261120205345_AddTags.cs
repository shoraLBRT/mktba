using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <summary>
    /// M-06 (#70): tags become an entity — <c>Tags</c> (one directory per language, unique name key
    /// and slug per locale) and <c>ArticleTags</c> (an article's tags in order). The existing
    /// comma-separated <c>"Articles"."Tags"</c> is backfilled into them and stays as the search copy
    /// the stored generated <c>"SearchVector"</c> reads (AddArticleSearch), so the search is unchanged.
    /// Also moves any article off the slug <c>tags</c>, now the tag page's first URL segment.
    /// </summary>
    public partial class AddTags : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Tags",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Locale = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    Name = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    NormalizedName = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Slug = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tags", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ArticleTags",
                columns: table => new
                {
                    ArticleId = table.Column<int>(type: "integer", nullable: false),
                    TagId = table.Column<int>(type: "integer", nullable: false),
                    Order = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ArticleTags", x => new { x.ArticleId, x.TagId });
                    table.ForeignKey(
                        name: "FK_ArticleTags_Articles_ArticleId",
                        column: x => x.ArticleId,
                        principalTable: "Articles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ArticleTags_Tags_TagId",
                        column: x => x.TagId,
                        principalTable: "Tags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ArticleTags_TagId",
                table: "ArticleTags",
                column: "TagId");

            migrationBuilder.CreateIndex(
                name: "IX_Tags_Locale_NormalizedName",
                table: "Tags",
                columns: new[] { "Locale", "NormalizedName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tags_Locale_Slug",
                table: "Tags",
                columns: new[] { "Locale", "Slug" },
                unique: true);

            // Existing comma-separated tags become tags of the article's language, in order. Names
            // are normalized as TagRules does: trimmed, white space collapsed, cut to 50 characters;
            // the key is lower case with ё folded to е, so a repeat in another case is one tag (the
            // spelling of the lowest article id wins). Slugs are transliterated as ArticleSlugRules
            // does (as in AddArticleSlugs) with the fallback word "tag", -2, -3… on a collision. No
            // name is dropped, even past the 16 an article may now carry. The search copy in
            // "Articles"."Tags" is then rewritten from the links, so it is what the code writes.
            migrationBuilder.Sql("""
                DO $$
                DECLARE
                    rec record;
                    tag_name text;
                    tag_key text;
                    found_id integer;
                    next_order integer;
                    base text;
                    candidate text;
                    n integer;
                BEGIN
                    FOR rec IN SELECT "Id", "Locale", "Tags" FROM "Articles" WHERE "Tags" IS NOT NULL ORDER BY "Id" LOOP
                        next_order := 0;
                        FOR tag_name IN
                            SELECT btrim(left(regexp_replace(btrim(t.tag), '\s+', ' ', 'g'), 50))
                            FROM unnest(string_to_array(rec."Tags", ',')) WITH ORDINALITY AS t(tag, ord)
                            ORDER BY t.ord
                        LOOP
                            CONTINUE WHEN tag_name = '';
                            tag_key := replace(lower(tag_name), 'ё', 'е');
                            found_id := NULL;
                            SELECT "Id" INTO found_id FROM "Tags" WHERE "Locale" = rec."Locale" AND "NormalizedName" = tag_key;

                            IF found_id IS NULL THEN
                                base := lower(translate(tag_name,
                                    'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
                                    'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'));
                                base := translate(base, '''’ʼʻʿʾ`', '');
                                base := replace(base, 'щ', 'shch');
                                base := replace(base, 'ё', 'yo');
                                base := replace(base, 'ж', 'zh');
                                base := replace(base, 'х', 'kh');
                                base := replace(base, 'ц', 'ts');
                                base := replace(base, 'ч', 'ch');
                                base := replace(base, 'ш', 'sh');
                                base := replace(base, 'ю', 'yu');
                                base := replace(base, 'я', 'ya');
                                base := translate(base, 'ъь', '');
                                base := translate(base, 'абвгдезийклмнопрстуфыэ', 'abvgdeziyklmnoprstufye');
                                base := regexp_replace(normalize(base, NFD),
                                    '[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]', '', 'g');
                                base := lower(base);
                                base := btrim(regexp_replace(base, '[^a-z0-9]+', '-', 'g'), '-');
                                IF base = '' THEN
                                    base := 'tag';
                                ELSIF base ~ '^[0-9]+$' THEN
                                    base := 'tag-' || base;
                                END IF;
                                base := rtrim(left(base, 80), '-');

                                candidate := base;
                                n := 1;
                                WHILE EXISTS (SELECT 1 FROM "Tags" WHERE "Locale" = rec."Locale" AND "Slug" = candidate) LOOP
                                    n := n + 1;
                                    candidate := rtrim(left(base, 80 - length('-' || n)), '-') || '-' || n;
                                END LOOP;

                                INSERT INTO "Tags" ("Locale", "Name", "NormalizedName", "Slug")
                                VALUES (rec."Locale", tag_name, tag_key, candidate)
                                RETURNING "Id" INTO found_id;
                            END IF;

                            IF NOT EXISTS (SELECT 1 FROM "ArticleTags" WHERE "ArticleId" = rec."Id" AND "TagId" = found_id) THEN
                                INSERT INTO "ArticleTags" ("ArticleId", "TagId", "Order") VALUES (rec."Id", found_id, next_order);
                                next_order := next_order + 1;
                            END IF;
                        END LOOP;
                    END LOOP;

                    UPDATE "Articles" AS a
                    SET "Tags" = (
                        SELECT string_agg(t."Name", ',' ORDER BY link."Order")
                        FROM "ArticleTags" AS link
                        JOIN "Tags" AS t ON t."Id" = link."TagId"
                        WHERE link."ArticleId" = a."Id")
                    WHERE a."Tags" IS NOT NULL;
                END $$;
                """);

            // The tag page took the first URL segment "tags" (ArticleSlugRules.Reserved): an article
            // on it moves to the first free tags-2, tags-3… of its locale and keeps "tags" as its
            // redirect, as MoveArticlesOffReservedSlugs did for the earlier words.
            migrationBuilder.Sql("""
                DO $$
                DECLARE
                    reserved_article RECORD;
                    candidate TEXT;
                    suffix INT;
                BEGIN
                    FOR reserved_article IN
                        SELECT "Id", "Locale", "Slug" FROM "Articles" WHERE "Slug" = 'tags' ORDER BY "Id"
                    LOOP
                        suffix := 2;
                        LOOP
                            candidate := reserved_article."Slug" || '-' || suffix;
                            EXIT WHEN NOT EXISTS (
                                    SELECT 1 FROM "Articles" WHERE "Locale" = reserved_article."Locale" AND "Slug" = candidate)
                                AND NOT EXISTS (
                                    SELECT 1 FROM "ArticleSlugRedirects" WHERE "Locale" = reserved_article."Locale" AND "Slug" = candidate);
                            suffix := suffix + 1;
                        END LOOP;

                        UPDATE "Articles" SET "Slug" = candidate WHERE "Id" = reserved_article."Id";

                        IF NOT EXISTS (
                            SELECT 1 FROM "ArticleSlugRedirects"
                            WHERE "Locale" = reserved_article."Locale" AND "Slug" = reserved_article."Slug")
                        THEN
                            INSERT INTO "ArticleSlugRedirects" ("Slug", "Locale", "ArticleId")
                            VALUES (reserved_article."Slug", reserved_article."Locale", reserved_article."Id");
                        END IF;
                    END LOOP;
                END $$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ArticleTags");

            migrationBuilder.DropTable(
                name: "Tags");
        }
    }
}
