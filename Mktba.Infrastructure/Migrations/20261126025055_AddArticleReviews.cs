using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddArticleReviews : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ArticleReviews",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ArticleId = table.Column<int>(type: "integer", nullable: false),
                    RevisionId = table.Column<int>(type: "integer", nullable: false),
                    ScholarId = table.Column<int>(type: "integer", nullable: false),
                    Verdict = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Comment = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    Mazhab = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ArticleReviews", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ArticleReviews_ArticleRevisions_RevisionId",
                        column: x => x.RevisionId,
                        principalTable: "ArticleRevisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ArticleReviews_Articles_ArticleId",
                        column: x => x.ArticleId,
                        principalTable: "Articles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ArticleReviews_Users_ScholarId",
                        column: x => x.ScholarId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ArticleReviews_ArticleId_ScholarId",
                table: "ArticleReviews",
                columns: new[] { "ArticleId", "ScholarId" });

            migrationBuilder.CreateIndex(
                name: "IX_ArticleReviews_RevisionId_ScholarId",
                table: "ArticleReviews",
                columns: new[] { "RevisionId", "ScholarId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ArticleReviews_ScholarId_UpdatedAt",
                table: "ArticleReviews",
                columns: new[] { "ScholarId", "UpdatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ArticleReviews");
        }
    }
}
