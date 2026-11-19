using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <summary>
    /// S-17 (#165): there is no default AI provider any more (decision D8). The settings row used to be
    /// created with OpenAI's base URL and model filled in. A row that still holds exactly those values
    /// and has no API key was never configured by an admin (the provider cannot be used without a key),
    /// so its base URL and model are cleared and the admin form shows them as empty. A row with an API
    /// key is left as is, even when it uses the same values, because an admin chose them.
    /// </summary>
    public partial class ClearAutoFilledAiProviderDefaults : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE "AiProviderSettings"
                SET "BaseUrl" = '', "Model" = ''
                WHERE "BaseUrl" = 'https://api.openai.com/v1'
                  AND "Model" = 'gpt-4o-mini'
                  AND ("ApiKey" IS NULL OR btrim("ApiKey") = '');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The cleared values were never chosen by an admin; there is nothing to restore.
        }
    }
}
