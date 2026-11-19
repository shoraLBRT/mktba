using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddArticleOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Articles_ParentArticleId",
                table: "Articles");

            migrationBuilder.AddColumn<int>(
                name: "Order",
                table: "Articles",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Existing siblings keep the order the tree showed them in until now: by id.
            migrationBuilder.Sql(
                """
                UPDATE "Articles" AS a
                SET "Order" = numbered.position
                FROM (
                    SELECT "Id", ROW_NUMBER() OVER (PARTITION BY "ParentArticleId" ORDER BY "Id") - 1 AS position
                    FROM "Articles"
                ) AS numbered
                WHERE a."Id" = numbered."Id";
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Articles_ParentArticleId_Order",
                table: "Articles",
                columns: new[] { "ParentArticleId", "Order" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Articles_ParentArticleId_Order",
                table: "Articles");

            migrationBuilder.DropColumn(
                name: "Order",
                table: "Articles");

            migrationBuilder.CreateIndex(
                name: "IX_Articles_ParentArticleId",
                table: "Articles",
                column: "ParentArticleId");
        }
    }
}
