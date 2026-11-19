using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <summary>
    /// S-14 (#16): a paragraph with a single opinion is common to all schools and carries no school
    /// links. Removes the links such paragraphs got before the API started rejecting them (the old demo
    /// seed linked them to all four system schools). The reader never showed them, so nothing visible changes.
    /// </summary>
    public partial class RemoveSchoolLinksFromPlainParagraphs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DELETE FROM "OpinionSchools" AS os
                USING "Opinions" AS o
                WHERE os."OpinionId" = o."Id"
                  AND (SELECT COUNT(*) FROM "Opinions" AS sibling WHERE sibling."ParagraphId" = o."ParagraphId") = 1;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The removed links carried no meaning and cannot be restored.
        }
    }
}
