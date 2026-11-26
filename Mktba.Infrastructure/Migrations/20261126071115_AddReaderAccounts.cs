using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <summary>
    /// U-05 (#126): readers' own accounts. Every user so far came by an invite or was the first admin,
    /// so their address counts as confirmed from the day they registered. The sign-up pages take three
    /// new first URL segments; an article already at one of them moves to the first free
    /// <c>{slug}-2</c>, <c>{slug}-3</c>, … of its locale and keeps the old slug as its redirect, as in
    /// <c>MoveArticlesOffReservedSlugs</c>. The words are spelled out here on purpose.
    /// </summary>
    public partial class AddReaderAccounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "EmailConfirmedAtUtc",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE "Users" SET "EmailConfirmedAtUtc" = "CreatedAtUtc";
                """);

            migrationBuilder.Sql("""
                DO $$
                DECLARE
                    reserved_article RECORD;
                    candidate TEXT;
                    suffix INT;
                BEGIN
                    FOR reserved_article IN
                        SELECT "Id", "Locale", "Slug" FROM "Articles"
                        WHERE "Slug" IN ('register', 'confirm-email', 'reset-password')
                        ORDER BY "Id"
                    LOOP
                        suffix := 2;
                        LOOP
                            candidate := reserved_article."Slug" || '-' || suffix;
                            EXIT WHEN NOT EXISTS (
                                    SELECT 1 FROM "Articles" WHERE "Locale" = reserved_article."Locale" AND "Slug" = candidate)
                                AND NOT EXISTS (
                                    SELECT 1 FROM "ArticleSlugRedirects" WHERE "Locale" = reserved_article."Locale" AND "Slug" = candidate);
                            suffix := suffix + 1;
                        END LOOP;

                        UPDATE "Articles" SET "Slug" = candidate WHERE "Id" = reserved_article."Id";

                        IF NOT EXISTS (
                            SELECT 1 FROM "ArticleSlugRedirects"
                            WHERE "Locale" = reserved_article."Locale" AND "Slug" = reserved_article."Slug")
                        THEN
                            INSERT INTO "ArticleSlugRedirects" ("Slug", "Locale", "ArticleId")
                            VALUES (reserved_article."Slug", reserved_article."Locale", reserved_article."Id");
                        END IF;
                    END LOOP;
                END $$;
                """);

            migrationBuilder.CreateTable(
                name: "AccountEmails",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    Purpose = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    State = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    NextAttemptAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastAttemptAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SentAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastError = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccountEmails", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AccountEmails_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AccountTokens",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    Purpose = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccountTokens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AccountTokens_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AccountEmails_State_NextAttemptAt",
                table: "AccountEmails",
                columns: new[] { "State", "NextAttemptAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AccountEmails_UserId_Purpose_CreatedAtUtc",
                table: "AccountEmails",
                columns: new[] { "UserId", "Purpose", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_AccountTokens_TokenHash",
                table: "AccountTokens",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AccountTokens_UserId_Purpose",
                table: "AccountTokens",
                columns: new[] { "UserId", "Purpose" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AccountEmails");

            migrationBuilder.DropTable(
                name: "AccountTokens");

            migrationBuilder.DropColumn(
                name: "EmailConfirmedAtUtc",
                table: "Users");
        }
    }
}
