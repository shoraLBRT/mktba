using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddArticleDrafts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ArticleDrafts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    ArticleId = table.Column<int>(type: "integer", nullable: true),
                    Snapshot = table.Column<string>(type: "jsonb", nullable: false),
                    BaseUpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ArticleDrafts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ArticleDrafts_Articles_ArticleId",
                        column: x => x.ArticleId,
                        principalTable: "Articles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ArticleDrafts_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ArticleDrafts_ArticleId",
                table: "ArticleDrafts",
                column: "ArticleId");

            migrationBuilder.CreateIndex(
                name: "IX_ArticleDrafts_UpdatedAt",
                table: "ArticleDrafts",
                column: "UpdatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_ArticleDrafts_UserId_ArticleId",
                table: "ArticleDrafts",
                columns: new[] { "UserId", "ArticleId" },
                unique: true)
                .Annotation("Npgsql:NullsDistinct", false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ArticleDrafts");
        }
    }
}
