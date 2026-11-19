using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddArticleStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "Articles",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Draft");

            // Backfill, so the public site keeps showing what it showed before statuses existed:
            // an article with content (the former "hasContent" rule: paragraphs, infobox fields,
            // infobox title or subtitle) is Published, and so is every ancestor of such an article,
            // because a Published article under a non-Published parent is hidden from the public tree.
            // Everything else (stubs with nothing published beneath them) stays Draft.
            migrationBuilder.Sql("""
                WITH RECURSIVE with_content AS (
                    SELECT a."Id", a."ParentArticleId"
                    FROM "Articles" a
                    WHERE EXISTS (SELECT 1 FROM "Paragraphs" p WHERE p."ArticleId" = a."Id")
                       OR EXISTS (SELECT 1 FROM "ArticleInfoboxFields" f WHERE f."ArticleId" = a."Id")
                       OR coalesce(a."InfoboxTitle", '') ~ '[^[:space:]]'
                       OR coalesce(a."InfoboxSubtitle", '') ~ '[^[:space:]]'
                ),
                published AS (
                    SELECT "Id", "ParentArticleId" FROM with_content
                    UNION
                    SELECT parent."Id", parent."ParentArticleId"
                    FROM "Articles" parent
                    JOIN published child ON child."ParentArticleId" = parent."Id"
                )
                UPDATE "Articles" SET "Status" = 'Published'
                WHERE "Id" IN (SELECT "Id" FROM published);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Status",
                table: "Articles");
        }
    }
}
