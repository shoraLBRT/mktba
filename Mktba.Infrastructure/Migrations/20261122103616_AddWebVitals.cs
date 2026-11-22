using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWebVitals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "MetricValue",
                table: "AnalyticsEvents",
                type: "double precision",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AnalyticsWebVitalDays",
                columns: table => new
                {
                    Day = table.Column<DateOnly>(type: "date", nullable: false),
                    Metric = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Samples = table.Column<int>(type: "integer", nullable: false),
                    P75 = table.Column<double>(type: "double precision", nullable: false),
                    Good = table.Column<int>(type: "integer", nullable: false),
                    NeedsImprovement = table.Column<int>(type: "integer", nullable: false),
                    Poor = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AnalyticsWebVitalDays", x => new { x.Day, x.Metric });
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AnalyticsWebVitalDays");

            migrationBuilder.DropColumn(
                name: "MetricValue",
                table: "AnalyticsEvents");
        }
    }
}
