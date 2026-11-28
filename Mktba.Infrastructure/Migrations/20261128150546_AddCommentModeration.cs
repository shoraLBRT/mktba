using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCommentModeration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "HoldReason",
                table: "ArticleComments",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ModeratedAt",
                table: "ArticleComments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ModeratedById",
                table: "ArticleComments",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "ArticleComments",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Published");

            migrationBuilder.CreateTable(
                name: "ArticleCommentReports",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CommentId = table.Column<int>(type: "integer", nullable: false),
                    ReporterId = table.Column<int>(type: "integer", nullable: false),
                    Reason = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ArticleCommentReports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ArticleCommentReports_ArticleComments_CommentId",
                        column: x => x.CommentId,
                        principalTable: "ArticleComments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ArticleCommentReports_Users_ReporterId",
                        column: x => x.ReporterId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CommentBans",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    Until = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedById = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommentBans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CommentBans_Users_CreatedById",
                        column: x => x.CreatedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_CommentBans_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ArticleComments_ModeratedById",
                table: "ArticleComments",
                column: "ModeratedById");

            migrationBuilder.CreateIndex(
                name: "IX_ArticleComments_Status_CreatedAt",
                table: "ArticleComments",
                columns: new[] { "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ArticleCommentReports_CommentId_ReporterId",
                table: "ArticleCommentReports",
                columns: new[] { "CommentId", "ReporterId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ArticleCommentReports_ReporterId",
                table: "ArticleCommentReports",
                column: "ReporterId");

            migrationBuilder.CreateIndex(
                name: "IX_CommentBans_CreatedById",
                table: "CommentBans",
                column: "CreatedById");

            migrationBuilder.CreateIndex(
                name: "IX_CommentBans_UserId",
                table: "CommentBans",
                column: "UserId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_ArticleComments_Users_ModeratedById",
                table: "ArticleComments",
                column: "ModeratedById",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ArticleComments_Users_ModeratedById",
                table: "ArticleComments");

            migrationBuilder.DropTable(
                name: "ArticleCommentReports");

            migrationBuilder.DropTable(
                name: "CommentBans");

            migrationBuilder.DropIndex(
                name: "IX_ArticleComments_ModeratedById",
                table: "ArticleComments");

            migrationBuilder.DropIndex(
                name: "IX_ArticleComments_Status_CreatedAt",
                table: "ArticleComments");

            migrationBuilder.DropColumn(
                name: "HoldReason",
                table: "ArticleComments");

            migrationBuilder.DropColumn(
                name: "ModeratedAt",
                table: "ArticleComments");

            migrationBuilder.DropColumn(
                name: "ModeratedById",
                table: "ArticleComments");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "ArticleComments");
        }
    }
}
