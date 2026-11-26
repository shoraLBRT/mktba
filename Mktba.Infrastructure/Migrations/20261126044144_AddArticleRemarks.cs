using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddArticleRemarks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ArticleRemarks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ArticleId = table.Column<int>(type: "integer", nullable: false),
                    RevisionId = table.Column<int>(type: "integer", nullable: false),
                    ScholarId = table.Column<int>(type: "integer", nullable: false),
                    ParagraphId = table.Column<int>(type: "integer", nullable: true),
                    OpinionId = table.Column<int>(type: "integer", nullable: true),
                    OnOpinion = table.Column<bool>(type: "boolean", nullable: false),
                    ParagraphOrder = table.Column<int>(type: "integer", nullable: false),
                    Excerpt = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ClosedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ClosedById = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ArticleRemarks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ArticleRemarks_ArticleRevisions_RevisionId",
                        column: x => x.RevisionId,
                        principalTable: "ArticleRevisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ArticleRemarks_Articles_ArticleId",
                        column: x => x.ArticleId,
                        principalTable: "Articles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ArticleRemarks_Opinions_OpinionId",
                        column: x => x.OpinionId,
                        principalTable: "Opinions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ArticleRemarks_Paragraphs_ParagraphId",
                        column: x => x.ParagraphId,
                        principalTable: "Paragraphs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ArticleRemarks_Users_ClosedById",
                        column: x => x.ClosedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ArticleRemarks_Users_ScholarId",
                        column: x => x.ScholarId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ArticleRemarkMessages",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RemarkId = table.Column<int>(type: "integer", nullable: false),
                    AuthorId = table.Column<int>(type: "integer", nullable: true),
                    Body = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ArticleRemarkMessages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ArticleRemarkMessages_ArticleRemarks_RemarkId",
                        column: x => x.RemarkId,
                        principalTable: "ArticleRemarks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ArticleRemarkMessages_Users_AuthorId",
                        column: x => x.AuthorId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ArticleRemarkMessages_AuthorId",
                table: "ArticleRemarkMessages",
                column: "AuthorId");

            migrationBuilder.CreateIndex(
                name: "IX_ArticleRemarkMessages_RemarkId_CreatedAt",
                table: "ArticleRemarkMessages",
                columns: new[] { "RemarkId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ArticleRemarks_ArticleId_Status",
                table: "ArticleRemarks",
                columns: new[] { "ArticleId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_ArticleRemarks_ClosedById",
                table: "ArticleRemarks",
                column: "ClosedById");

            migrationBuilder.CreateIndex(
                name: "IX_ArticleRemarks_OpinionId",
                table: "ArticleRemarks",
                column: "OpinionId");

            migrationBuilder.CreateIndex(
                name: "IX_ArticleRemarks_ParagraphId",
                table: "ArticleRemarks",
                column: "ParagraphId");

            migrationBuilder.CreateIndex(
                name: "IX_ArticleRemarks_RevisionId",
                table: "ArticleRemarks",
                column: "RevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_ArticleRemarks_ScholarId_UpdatedAt",
                table: "ArticleRemarks",
                columns: new[] { "ScholarId", "UpdatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ArticleRemarkMessages");

            migrationBuilder.DropTable(
                name: "ArticleRemarks");
        }
    }
}
