using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSearchResultCounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SearchesWithoutResults",
                table: "AnalyticsSearchDays",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "ResultCount",
                table: "AnalyticsEvents",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SearchesWithoutResults",
                table: "AnalyticsDays",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SearchesWithoutResults",
                table: "AnalyticsSearchDays");

            migrationBuilder.DropColumn(
                name: "ResultCount",
                table: "AnalyticsEvents");

            migrationBuilder.DropColumn(
                name: "SearchesWithoutResults",
                table: "AnalyticsDays");
        }
    }
}
