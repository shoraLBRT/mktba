using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddArticleRevisionFingerprints : Migration
    {
        /// <summary>
        /// V-05 (#121). The existing revisions get their fingerprints from <c>ReviewFingerprintBackfill</c>
        /// right after the migrations (the hash is the C# normalization of the snapshot), not from SQL here.
        /// </summary>
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ArticleRevisionFingerprints",
                columns: table => new
                {
                    RevisionId = table.Column<int>(type: "integer", nullable: false),
                    Scope = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Hash = table.Column<string>(type: "character(64)", fixedLength: true, maxLength: 64, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ArticleRevisionFingerprints", x => new { x.RevisionId, x.Scope });
                    table.ForeignKey(
                        name: "FK_ArticleRevisionFingerprints_ArticleRevisions_RevisionId",
                        column: x => x.RevisionId,
                        principalTable: "ArticleRevisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ArticleRevisionFingerprints");
        }
    }
}
