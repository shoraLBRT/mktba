using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAnalyticsVisitorAndDedupIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "VisitorId",
                table: "AnalyticsEvents",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsEvents_ViewId",
                table: "AnalyticsEvents",
                column: "ViewId");

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsEvents_VisitorId_OccurredAtUtc",
                table: "AnalyticsEvents",
                columns: new[] { "VisitorId", "OccurredAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AnalyticsEvents_ViewId",
                table: "AnalyticsEvents");

            migrationBuilder.DropIndex(
                name: "IX_AnalyticsEvents_VisitorId_OccurredAtUtc",
                table: "AnalyticsEvents");

            migrationBuilder.DropColumn(
                name: "VisitorId",
                table: "AnalyticsEvents");
        }
    }
}
