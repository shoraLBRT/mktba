using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddArticleTrash : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Articles",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DeletedById",
                table: "Articles",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Articles_DeletedAt",
                table: "Articles",
                column: "DeletedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Articles_DeletedById",
                table: "Articles",
                column: "DeletedById");

            migrationBuilder.AddForeignKey(
                name: "FK_Articles_Users_DeletedById",
                table: "Articles",
                column: "DeletedById",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Articles_Users_DeletedById",
                table: "Articles");

            migrationBuilder.DropIndex(
                name: "IX_Articles_DeletedAt",
                table: "Articles");

            migrationBuilder.DropIndex(
                name: "IX_Articles_DeletedById",
                table: "Articles");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Articles");

            migrationBuilder.DropColumn(
                name: "DeletedById",
                table: "Articles");
        }
    }
}
