using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUserRoles : Migration
    {
        /// <summary>
        /// Stores the role by name. The only value so far was 0 (Admin), so every existing user stays
        /// an admin; any other number, which no code wrote, becomes the least privileged Reader.
        /// </summary>
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                ALTER TABLE "Users" ALTER COLUMN "Role" TYPE character varying(16)
                USING CASE "Role" WHEN 0 THEN 'Admin' ELSE 'Reader' END;
                """);
        }

        /// <summary>
        /// Back to the single-role integer column. Before this migration every user was an admin, so a
        /// rollback refuses to run while non-admin users exist rather than turn them into admins.
        /// </summary>
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM "Users" WHERE "Role" <> 'Admin') THEN
                        RAISE EXCEPTION 'Users with a role other than Admin exist; remove or promote them before rolling back AddUserRoles.';
                    END IF;
                END $$;
                ALTER TABLE "Users" ALTER COLUMN "Role" TYPE integer USING 0;
                """);
        }
    }
}
