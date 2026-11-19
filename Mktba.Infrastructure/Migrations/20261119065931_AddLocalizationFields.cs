using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <summary>
    /// M-09 (#27): every existing article becomes a Russian article in a translation group of its
    /// own, and slugs (current and old) become unique per locale instead of globally.
    /// </summary>
    public partial class AddLocalizationFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ArticleSlugRedirects_Slug",
                table: "ArticleSlugRedirects");

            migrationBuilder.DropIndex(
                name: "IX_Articles_Slug",
                table: "Articles");

            migrationBuilder.AddColumn<string>(
                name: "Locale",
                table: "ArticleSlugRedirects",
                type: "character varying(8)",
                maxLength: 8,
                nullable: false,
                defaultValue: "ru");

            migrationBuilder.AddColumn<string>(
                name: "Locale",
                table: "Articles",
                type: "character varying(8)",
                maxLength: 8,
                nullable: false,
                defaultValue: "ru");

            // The volatile default gives each existing row its own group; it is dropped right after,
            // so new groups come from the application.
            migrationBuilder.AddColumn<Guid>(
                name: "TranslationGroupId",
                table: "Articles",
                type: "uuid",
                nullable: false,
                defaultValueSql: "gen_random_uuid()");

            migrationBuilder.AlterColumn<Guid>(
                name: "TranslationGroupId",
                table: "Articles",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldDefaultValueSql: "gen_random_uuid()");

            migrationBuilder.CreateTable(
                name: "SchoolTranslations",
                columns: table => new
                {
                    SchoolId = table.Column<int>(type: "integer", nullable: false),
                    Locale = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ShortName = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SchoolTranslations", x => new { x.SchoolId, x.Locale });
                    table.ForeignKey(
                        name: "FK_SchoolTranslations_Schools_SchoolId",
                        column: x => x.SchoolId,
                        principalTable: "Schools",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ArticleSlugRedirects_Locale_Slug",
                table: "ArticleSlugRedirects",
                columns: new[] { "Locale", "Slug" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Articles_Locale_Slug",
                table: "Articles",
                columns: new[] { "Locale", "Slug" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Articles_TranslationGroupId_Locale",
                table: "Articles",
                columns: new[] { "TranslationGroupId", "Locale" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SchoolTranslations");

            migrationBuilder.DropIndex(
                name: "IX_ArticleSlugRedirects_Locale_Slug",
                table: "ArticleSlugRedirects");

            migrationBuilder.DropIndex(
                name: "IX_Articles_Locale_Slug",
                table: "Articles");

            migrationBuilder.DropIndex(
                name: "IX_Articles_TranslationGroupId_Locale",
                table: "Articles");

            migrationBuilder.DropColumn(
                name: "Locale",
                table: "ArticleSlugRedirects");

            migrationBuilder.DropColumn(
                name: "Locale",
                table: "Articles");

            migrationBuilder.DropColumn(
                name: "TranslationGroupId",
                table: "Articles");

            migrationBuilder.CreateIndex(
                name: "IX_ArticleSlugRedirects_Slug",
                table: "ArticleSlugRedirects",
                column: "Slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Articles_Slug",
                table: "Articles",
                column: "Slug",
                unique: true);
        }
    }
}
