using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddArticleRevisions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "PublishedRevisionId",
                table: "Articles",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ArticleRevisions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ArticleId = table.Column<int>(type: "integer", nullable: false),
                    Number = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AuthorId = table.Column<int>(type: "integer", nullable: true),
                    Comment = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Snapshot = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ArticleRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ArticleRevisions_Articles_ArticleId",
                        column: x => x.ArticleId,
                        principalTable: "Articles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ArticleRevisions_Users_AuthorId",
                        column: x => x.AuthorId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Articles_PublishedRevisionId",
                table: "Articles",
                column: "PublishedRevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_ArticleRevisions_ArticleId_Number",
                table: "ArticleRevisions",
                columns: new[] { "ArticleId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ArticleRevisions_AuthorId",
                table: "ArticleRevisions",
                column: "AuthorId");

            migrationBuilder.AddForeignKey(
                name: "FK_Articles_ArticleRevisions_PublishedRevisionId",
                table: "Articles",
                column: "PublishedRevisionId",
                principalTable: "ArticleRevisions",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            // Backfill: every existing article gets revision 1 built from its current working copy,
            // in the same JSON shape as ArticleSnapshotDto (schema version 1, camelCase). Articles
            // that are Published now record it as their published revision.
            migrationBuilder.Sql("""
                INSERT INTO "ArticleRevisions" ("ArticleId", "Number", "CreatedAt", "AuthorId", "Comment", "Snapshot")
                SELECT
                    a."Id",
                    1,
                    a."UpdatedAt",
                    NULL,
                    'Исходная версия статьи (до ведения истории правок)',
                    jsonb_build_object(
                        'schemaVersion', 1,
                        'title', a."Title",
                        'slug', a."Slug",
                        'summary', a."Summary",
                        'tags', COALESCE(
                            (SELECT jsonb_agg(btrim(t.tag) ORDER BY t.pos)
                             FROM unnest(string_to_array(a."Tags", ',')) WITH ORDINALITY AS t(tag, pos)
                             WHERE btrim(t.tag) <> ''),
                            '[]'::jsonb),
                        'infobox', CASE
                            WHEN a."InfoboxTitle" IS NULL AND a."InfoboxSubtitle" IS NULL
                                 AND NOT EXISTS (SELECT 1 FROM "ArticleInfoboxFields" f WHERE f."ArticleId" = a."Id")
                            THEN NULL
                            ELSE jsonb_build_object(
                                'title', a."InfoboxTitle",
                                'subtitle', a."InfoboxSubtitle",
                                'fields', COALESCE(
                                    (SELECT jsonb_agg(jsonb_build_object(
                                                'order', f."Order", 'key', f."Key", 'label', f."Label", 'value', f."Value")
                                            ORDER BY f."Order")
                                     FROM "ArticleInfoboxFields" f WHERE f."ArticleId" = a."Id"),
                                    '[]'::jsonb))
                        END,
                        'paragraphs', COALESCE(
                            (SELECT jsonb_agg(jsonb_build_object(
                                        'order', p."Order",
                                        'opinions', COALESCE(
                                            (SELECT jsonb_agg(jsonb_build_object(
                                                        'content', o."Content",
                                                        'isDefault', o."IsDefault",
                                                        'schoolIds', COALESCE(
                                                            (SELECT jsonb_agg(os."SchoolId" ORDER BY os."SchoolId")
                                                             FROM "OpinionSchools" os WHERE os."OpinionId" = o."Id"),
                                                            '[]'::jsonb))
                                                    ORDER BY o."Id")
                                             FROM "Opinions" o WHERE o."ParagraphId" = p."Id"),
                                            '[]'::jsonb))
                                    ORDER BY p."Order", p."Id")
                             FROM "Paragraphs" p WHERE p."ArticleId" = a."Id"),
                            '[]'::jsonb),
                        'relatedLinks', COALESCE(
                            (SELECT jsonb_agg(jsonb_build_object(
                                        'relatedArticleId', l."RelatedArticleId",
                                        'relatedArticleTitle', r."Title",
                                        'relatedArticleSlug', r."Slug",
                                        'order', l."Order")
                                    ORDER BY l."Order")
                             FROM "ArticleRelatedLinks" l
                             JOIN "Articles" r ON r."Id" = l."RelatedArticleId"
                             WHERE l."ArticleId" = a."Id"),
                            '[]'::jsonb))
                FROM "Articles" a;

                UPDATE "Articles" a
                SET "PublishedRevisionId" = rev."Id"
                FROM "ArticleRevisions" rev
                WHERE rev."ArticleId" = a."Id" AND rev."Number" = 1 AND a."Status" = 'Published';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Articles_ArticleRevisions_PublishedRevisionId",
                table: "Articles");

            migrationBuilder.DropTable(
                name: "ArticleRevisions");

            migrationBuilder.DropIndex(
                name: "IX_Articles_PublishedRevisionId",
                table: "Articles");

            migrationBuilder.DropColumn(
                name: "PublishedRevisionId",
                table: "Articles");
        }
    }
}
