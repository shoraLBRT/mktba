using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mktba.Infrastructure.Migrations
{
    /// <summary>
    /// O-02 (#53): articles moved to <c>/{slug}</c>, so a slug may no longer be one of the site's
    /// first URL segments (<c>ArticleSlugRules.Reserved</c> as of this migration). An article that
    /// already has such a slug gets the first free <c>{slug}-2</c>, <c>{slug}-3</c>, … of its locale,
    /// and the old slug is kept as its redirect, as an editor's rename would, so an old
    /// <c>/article/{slug}</c> link still reaches it. The list is spelled out here on purpose: a later
    /// change to the rules does not rewrite what this migration did.
    /// </summary>
    public partial class MoveArticlesOffReservedSlugs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$
                DECLARE
                    reserved_article RECORD;
                    candidate TEXT;
                    suffix INT;
                BEGIN
                    FOR reserved_article IN
                        SELECT "Id", "Locale", "Slug" FROM "Articles"
                        WHERE "Slug" IN ('admin', 'api', 'article', 'articles', 'assets', 'authors', 'feedback',
                                         'login', 'search', 'sitemaps', 'ru', 'en')
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
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Nothing to undo: the moved articles keep their new slugs, and the old ones keep redirecting.
        }
    }
}
