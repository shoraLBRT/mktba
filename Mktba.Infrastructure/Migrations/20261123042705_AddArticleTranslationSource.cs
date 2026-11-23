using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddArticleTranslationSource : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "TranslatedFromId",
                table: "Articles",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TranslatedFromRevision",
                table: "Articles",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Articles_TranslatedFromId",
                table: "Articles",
                column: "TranslatedFromId");

            migrationBuilder.AddForeignKey(
                name: "FK_Articles_Articles_TranslatedFromId",
                table: "Articles",
                column: "TranslatedFromId",
                principalTable: "Articles",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Articles_Articles_TranslatedFromId",
                table: "Articles");

            migrationBuilder.DropIndex(
                name: "IX_Articles_TranslatedFromId",
                table: "Articles");

            migrationBuilder.DropColumn(
                name: "TranslatedFromId",
                table: "Articles");

            migrationBuilder.DropColumn(
                name: "TranslatedFromRevision",
                table: "Articles");
        }
    }
}
