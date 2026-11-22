using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAnalyticsEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AnalyticsEvents",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    OccurredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ViewId = table.Column<Guid>(type: "uuid", nullable: true),
                    ArticleId = table.Column<int>(type: "integer", nullable: true),
                    ParagraphId = table.Column<int>(type: "integer", nullable: true),
                    OpinionId = table.Column<int>(type: "integer", nullable: true),
                    SchoolId = table.Column<int>(type: "integer", nullable: true),
                    ScrollDepth = table.Column<short>(type: "smallint", nullable: true),
                    Query = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    TargetPath = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AnalyticsEvents", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsEvents_ArticleId_OccurredAtUtc",
                table: "AnalyticsEvents",
                columns: new[] { "ArticleId", "OccurredAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsEvents_OccurredAtUtc",
                table: "AnalyticsEvents",
                column: "OccurredAtUtc");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AnalyticsEvents");
        }
    }
}
