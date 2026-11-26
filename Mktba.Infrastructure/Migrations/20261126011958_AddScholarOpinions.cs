using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <summary>
    /// M-08 (#116): custom schools become shared scholar opinions. Existing ones are kept in place —
    /// their names, slugs, links and <c>ArticleScopeId</c> stay, the new scholar fields start empty —
    /// and purging the article one was created for no longer deletes it (the FK becomes SetNull).
    /// </summary>
    public partial class AddScholarOpinions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Schools_Articles_ArticleScopeId",
                table: "Schools");

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Schools",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ScholarArticleId",
                table: "Schools",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ScholarName",
                table: "Schools",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ScholarYears",
                table: "Schools",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Schools_ScholarArticleId",
                table: "Schools",
                column: "ScholarArticleId");

            migrationBuilder.AddForeignKey(
                name: "FK_Schools_Articles_ArticleScopeId",
                table: "Schools",
                column: "ArticleScopeId",
                principalTable: "Articles",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Schools_Articles_ScholarArticleId",
                table: "Schools",
                column: "ScholarArticleId",
                principalTable: "Articles",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Schools_Articles_ArticleScopeId",
                table: "Schools");

            migrationBuilder.DropForeignKey(
                name: "FK_Schools_Articles_ScholarArticleId",
                table: "Schools");

            migrationBuilder.DropIndex(
                name: "IX_Schools_ScholarArticleId",
                table: "Schools");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "Schools");

            migrationBuilder.DropColumn(
                name: "ScholarArticleId",
                table: "Schools");

            migrationBuilder.DropColumn(
                name: "ScholarName",
                table: "Schools");

            migrationBuilder.DropColumn(
                name: "ScholarYears",
                table: "Schools");

            migrationBuilder.AddForeignKey(
                name: "FK_Schools_Articles_ArticleScopeId",
                table: "Schools",
                column: "ArticleScopeId",
                principalTable: "Articles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
