using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <summary>
    /// M-01 (#22): every article gets a slug, and old slugs are kept as redirects.
    /// Existing articles are backfilled from their titles, in id order, with the same rules as
    /// <c>ArticleSlugRules.FromTitle</c>: Russian letters transliterated, apostrophes removed,
    /// diacritics stripped, everything else collapsed into single hyphens, at most 80 characters,
    /// <c>article</c> for an empty result and an <c>article-</c> prefix for digits only. A slug
    /// already taken by an earlier article gets -2, -3, and so on. The column default only exists
    /// while the column is added and is dropped afterwards.
    /// </summary>
    public partial class AddArticleSlugs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Slug",
                table: "Articles",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql("""
                DO $$
                DECLARE
                    rec record;
                    base text;
                    candidate text;
                    n integer;
                BEGIN
                    FOR rec IN SELECT "Id", "Title" FROM "Articles" ORDER BY "Id" LOOP
                        base := lower(translate(coalesce(rec."Title", ''),
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
                            '[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]', '', 'g');
                        base := lower(base);
                        base := btrim(regexp_replace(base, '[^a-z0-9]+', '-', 'g'), '-');
                        IF base = '' THEN
                            base := 'article';
                        ELSIF base ~ '^[0-9]+$' THEN
                            base := 'article-' || base;
                        END IF;
                        base := rtrim(left(base, 80), '-');

                        candidate := base;
                        n := 1;
                        WHILE EXISTS (SELECT 1 FROM "Articles" WHERE "Slug" = candidate) LOOP
                            n := n + 1;
                            candidate := rtrim(left(base, 80 - length('-' || n)), '-') || '-' || n;
                        END LOOP;

                        UPDATE "Articles" SET "Slug" = candidate WHERE "Id" = rec."Id";
                    END LOOP;
                END $$;

                ALTER TABLE "Articles" ALTER COLUMN "Slug" DROP DEFAULT;
                """);

            migrationBuilder.CreateTable(
                name: "ArticleSlugRedirects",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Slug = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    ArticleId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ArticleSlugRedirects", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ArticleSlugRedirects_Articles_ArticleId",
                        column: x => x.ArticleId,
                        principalTable: "Articles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Articles_Slug",
                table: "Articles",
                column: "Slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ArticleSlugRedirects_ArticleId",
                table: "ArticleSlugRedirects",
                column: "ArticleId");

            migrationBuilder.CreateIndex(
                name: "IX_ArticleSlugRedirects_Slug",
                table: "ArticleSlugRedirects",
                column: "Slug",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ArticleSlugRedirects");

            migrationBuilder.DropIndex(
                name: "IX_Articles_Slug",
                table: "Articles");

            migrationBuilder.DropColumn(
                name: "Slug",
                table: "Articles");
        }
    }
}
