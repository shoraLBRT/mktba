using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAnalyticsDailySummaries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AnalyticsArticleDays",
                columns: table => new
                {
                    Day = table.Column<DateOnly>(type: "date", nullable: false),
                    ArticleId = table.Column<int>(type: "integer", nullable: false),
                    Views = table.Column<int>(type: "integer", nullable: false),
                    Readers = table.Column<int>(type: "integer", nullable: false),
                    OpinionsShown = table.Column<int>(type: "integer", nullable: false),
                    OpinionSwitches = table.Column<int>(type: "integer", nullable: false),
                    ReachedDepth25 = table.Column<int>(type: "integer", nullable: false),
                    ReachedDepth50 = table.Column<int>(type: "integer", nullable: false),
                    ReachedDepth75 = table.Column<int>(type: "integer", nullable: false),
                    ReachedDepth100 = table.Column<int>(type: "integer", nullable: false),
                    InternalLinkClicks = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AnalyticsArticleDays", x => new { x.ArticleId, x.Day });
                });

            migrationBuilder.CreateTable(
                name: "AnalyticsArticleSchoolDays",
                columns: table => new
                {
                    Day = table.Column<DateOnly>(type: "date", nullable: false),
                    ArticleId = table.Column<int>(type: "integer", nullable: false),
                    SchoolId = table.Column<int>(type: "integer", nullable: false),
                    Views = table.Column<int>(type: "integer", nullable: false),
                    Readers = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AnalyticsArticleSchoolDays", x => new { x.ArticleId, x.SchoolId, x.Day });
                });

            migrationBuilder.CreateTable(
                name: "AnalyticsAuthorDays",
                columns: table => new
                {
                    Day = table.Column<DateOnly>(type: "date", nullable: false),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    Views = table.Column<int>(type: "integer", nullable: false),
                    Readers = table.Column<int>(type: "integer", nullable: false),
                    Articles = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AnalyticsAuthorDays", x => new { x.UserId, x.Day });
                });

            migrationBuilder.CreateTable(
                name: "AnalyticsDays",
                columns: table => new
                {
                    Day = table.Column<DateOnly>(type: "date", nullable: false),
                    ArticleViews = table.Column<int>(type: "integer", nullable: false),
                    Visitors = table.Column<int>(type: "integer", nullable: false),
                    Searches = table.Column<int>(type: "integer", nullable: false),
                    IsFinal = table.Column<bool>(type: "boolean", nullable: false),
                    AggregatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AnalyticsDays", x => x.Day);
                });

            migrationBuilder.CreateTable(
                name: "AnalyticsSearchDays",
                columns: table => new
                {
                    Day = table.Column<DateOnly>(type: "date", nullable: false),
                    Query = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Searches = table.Column<int>(type: "integer", nullable: false),
                    Searchers = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AnalyticsSearchDays", x => new { x.Day, x.Query });
                });

            migrationBuilder.CreateTable(
                name: "AnalyticsTagDays",
                columns: table => new
                {
                    Day = table.Column<DateOnly>(type: "date", nullable: false),
                    TagId = table.Column<int>(type: "integer", nullable: false),
                    Views = table.Column<int>(type: "integer", nullable: false),
                    Readers = table.Column<int>(type: "integer", nullable: false),
                    Articles = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AnalyticsTagDays", x => new { x.TagId, x.Day });
                });

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsArticleDays_Day",
                table: "AnalyticsArticleDays",
                column: "Day");

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsArticleSchoolDays_Day",
                table: "AnalyticsArticleSchoolDays",
                column: "Day");

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsAuthorDays_Day",
                table: "AnalyticsAuthorDays",
                column: "Day");

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsTagDays_Day",
                table: "AnalyticsTagDays",
                column: "Day");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AnalyticsArticleDays");

            migrationBuilder.DropTable(
                name: "AnalyticsArticleSchoolDays");

            migrationBuilder.DropTable(
                name: "AnalyticsAuthorDays");

            migrationBuilder.DropTable(
                name: "AnalyticsDays");

            migrationBuilder.DropTable(
                name: "AnalyticsSearchDays");

            migrationBuilder.DropTable(
                name: "AnalyticsTagDays");
        }
    }
}
