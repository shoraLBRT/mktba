using Microsoft.EntityFrameworkCore;
using Mktba.Domain.Entities;

namespace Mktba.Infrastructure.Data
{
    public class MktbaDbContext : DbContext
    {
        public MktbaDbContext(DbContextOptions<MktbaDbContext> options)
            : base(options)
        { }

        public DbSet<Article> Articles { get; set; } = null!;
        public DbSet<ArticleInfoboxField> ArticleInfoboxFields { get; set; } = null!;
        public DbSet<ArticleRelatedLink> ArticleRelatedLinks { get; set; } = null!;
        public DbSet<ArticleSlugRedirect> ArticleSlugRedirects { get; set; } = null!;
        public DbSet<DeletedArticleSlug> DeletedArticleSlugs { get; set; } = null!;
        public DbSet<ArticleCoAuthor> ArticleCoAuthors { get; set; } = null!;
        public DbSet<ArticleRevision> ArticleRevisions { get; set; } = null!;
        public DbSet<Paragraph> Paragraphs { get; set; } = null!;
        public DbSet<Opinion> Opinions { get; set; } = null!;
        public DbSet<School> Schools { get; set; } = null!;
        public DbSet<SchoolTranslation> SchoolTranslations { get; set; } = null!;
        public DbSet<OpinionSchool> OpinionSchools { get; set; } = null!;
        public DbSet<AiProviderSettings> AiProviderSettings { get; set; } = null!;
        public DbSet<User> Users { get; set; } = null!;
        public DbSet<Invite> Invites { get; set; } = null!;
        public DbSet<RefreshSession> RefreshSessions { get; set; } = null!;

        /// <summary>Longest stored User-Agent of a refresh session; longer values are cut.</summary>
        public const int SessionUserAgentMaxLength = 256;

        /// <summary>Longest stored client IP of a refresh session (an IPv6 address fits).</summary>
        public const int SessionIpAddressMaxLength = 64;

        /// <summary>Longest edit comment on a revision.</summary>
        public const int RevisionCommentMaxLength = 500;

        /// <summary>Longest article slug; the slug rules in the application layer use the same limit.</summary>
        public const int ArticleSlugMaxLength = 80;

        /// <summary>Longest SEO title of an article.</summary>
        public const int SeoTitleMaxLength = 70;

        /// <summary>Longest SEO description of an article.</summary>
        public const int SeoDescriptionMaxLength = 160;

        /// <summary>Longest social image URL of an article.</summary>
        public const int SocialImageUrlMaxLength = 2048;

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // Article slug: unique per language (M-09, #27), so a translation may keep the original's slug.
            modelBuilder.Entity<Article>()
                .Property(a => a.Slug)
                .HasMaxLength(ArticleSlugMaxLength)
                .IsRequired();

            modelBuilder.Entity<Article>()
                .Property(a => a.Status)
                .HasConversion<string>()
                .HasMaxLength(16)
                .IsRequired();

            modelBuilder.Entity<Article>()
                .Property(a => a.Locale)
                .HasMaxLength(Locales.MaxLength)
                .HasDefaultValue(Locales.Default)
                .IsRequired();

            modelBuilder.Entity<Article>()
                .HasIndex(a => new { a.Locale, a.Slug })
                .IsUnique();

            // A translation group holds at most one article per language (D6, #21).
            modelBuilder.Entity<Article>()
                .HasIndex(a => new { a.TranslationGroupId, a.Locale })
                .IsUnique();

            modelBuilder.Entity<ArticleSlugRedirect>()
                .Property(r => r.Slug)
                .HasMaxLength(ArticleSlugMaxLength)
                .IsRequired();

            modelBuilder.Entity<ArticleSlugRedirect>()
                .Property(r => r.Locale)
                .HasMaxLength(Locales.MaxLength)
                .HasDefaultValue(Locales.Default)
                .IsRequired();

            modelBuilder.Entity<ArticleSlugRedirect>()
                .HasIndex(r => new { r.Locale, r.Slug })
                .IsUnique();

            modelBuilder.Entity<ArticleSlugRedirect>()
                .HasOne(r => r.Article)
                .WithMany(a => a.SlugRedirects)
                .HasForeignKey(r => r.ArticleId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<DeletedArticleSlug>()
                .Property(d => d.Slug)
                .HasMaxLength(ArticleSlugMaxLength)
                .IsRequired();

            modelBuilder.Entity<DeletedArticleSlug>()
                .Property(d => d.Locale)
                .HasMaxLength(Locales.MaxLength)
                .IsRequired();

            modelBuilder.Entity<DeletedArticleSlug>()
                .HasIndex(d => new { d.Locale, d.Slug })
                .IsUnique();

            // Authorship: deleting a user keeps their articles (author becomes null) and drops their co-authorships.
            modelBuilder.Entity<Article>()
                .HasOne(a => a.Author)
                .WithMany()
                .HasForeignKey(a => a.AuthorId)
                .OnDelete(DeleteBehavior.SetNull)
                .IsRequired(false);

            modelBuilder.Entity<ArticleCoAuthor>()
                .HasKey(c => new { c.ArticleId, c.UserId });

            modelBuilder.Entity<ArticleCoAuthor>()
                .HasOne(c => c.Article)
                .WithMany(a => a.CoAuthors)
                .HasForeignKey(c => c.ArticleId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<ArticleCoAuthor>()
                .HasOne(c => c.User)
                .WithMany()
                .HasForeignKey(c => c.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // Revisions: append-only history; deleting the article drops it, deleting a user keeps it.
            modelBuilder.Entity<ArticleRevision>()
                .HasOne(r => r.Article)
                .WithMany(a => a.Revisions)
                .HasForeignKey(r => r.ArticleId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<ArticleRevision>()
                .HasIndex(r => new { r.ArticleId, r.Number })
                .IsUnique();

            modelBuilder.Entity<ArticleRevision>()
                .HasOne(r => r.Author)
                .WithMany()
                .HasForeignKey(r => r.AuthorId)
                .OnDelete(DeleteBehavior.SetNull)
                .IsRequired(false);

            modelBuilder.Entity<ArticleRevision>()
                .Property(r => r.Comment)
                .HasMaxLength(RevisionCommentMaxLength);

            modelBuilder.Entity<ArticleRevision>()
                .Property(r => r.Snapshot)
                .HasColumnType("jsonb")
                .IsRequired();

            modelBuilder.Entity<Article>()
                .HasOne(a => a.PublishedRevision)
                .WithMany()
                .HasForeignKey(a => a.PublishedRevisionId)
                .OnDelete(DeleteBehavior.SetNull)
                .IsRequired(false);

            // Article hierarchy
            modelBuilder.Entity<Article>()
                .HasMany(a => a.ChildArticles)
                .WithOne(a => a.ParentArticle)
                .HasForeignKey(a => a.ParentArticleId)
                .OnDelete(DeleteBehavior.Restrict);

            // The tree reads siblings in (ParentArticleId, Order) order.
            modelBuilder.Entity<Article>()
                .HasIndex(a => new { a.ParentArticleId, a.Order });

            modelBuilder.Entity<Article>()
                .HasMany(a => a.Paragraphs)
                .WithOne(p => p.Article)
                .HasForeignKey(p => p.ArticleId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Article>()
                .HasMany(a => a.InfoboxFields)
                .WithOne(f => f.Article)
                .HasForeignKey(f => f.ArticleId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Article>()
                .Property(a => a.InfoboxTitle)
                .HasMaxLength(160);

            modelBuilder.Entity<Article>()
                .Property(a => a.InfoboxSubtitle)
                .HasMaxLength(240);

            modelBuilder.Entity<Article>()
                .Property(a => a.Summary)
                .HasMaxLength(500);

            modelBuilder.Entity<Article>()
                .Property(a => a.Tags)
                .HasMaxLength(1000);

            modelBuilder.Entity<Article>()
                .Property(a => a.SeoTitle)
                .HasMaxLength(SeoTitleMaxLength);

            modelBuilder.Entity<Article>()
                .Property(a => a.SeoDescription)
                .HasMaxLength(SeoDescriptionMaxLength);

            modelBuilder.Entity<Article>()
                .Property(a => a.SocialImageUrl)
                .HasMaxLength(SocialImageUrlMaxLength);

            modelBuilder.Entity<Article>()
                .HasMany(a => a.RelatedLinks)
                .WithOne(l => l.Article)
                .HasForeignKey(l => l.ArticleId)
                .OnDelete(DeleteBehavior.Cascade);

            // Custom schools scoped to article
            modelBuilder.Entity<Article>()
                .HasMany(a => a.CustomSchools)
                .WithOne(s => s.ArticleScope)
                .HasForeignKey(s => s.ArticleScopeId)
                .OnDelete(DeleteBehavior.Cascade)
                .IsRequired(false);

            // ArticleInfoboxField
            modelBuilder.Entity<ArticleInfoboxField>()
                .Property(f => f.Key)
                .HasMaxLength(80);

            modelBuilder.Entity<ArticleInfoboxField>()
                .Property(f => f.Label)
                .HasMaxLength(120);

            modelBuilder.Entity<ArticleInfoboxField>()
                .HasIndex(f => new { f.ArticleId, f.Order });

            // ArticleRelatedLink
            modelBuilder.Entity<ArticleRelatedLink>()
                .HasOne(l => l.RelatedArticle)
                .WithMany()
                .HasForeignKey(l => l.RelatedArticleId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<ArticleRelatedLink>()
                .HasIndex(l => new { l.ArticleId, l.Order });

            // Paragraph
            modelBuilder.Entity<Paragraph>()
                .HasMany(p => p.Opinions)
                .WithOne(o => o.Paragraph)
                .HasForeignKey(o => o.ParagraphId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Paragraph>()
                .HasIndex(p => new { p.ArticleId, p.Order });

            // Opinion
            modelBuilder.Entity<Opinion>()
                .Property(o => o.Content)
                .HasColumnType("text");

            // School
            modelBuilder.Entity<School>()
                .HasIndex(s => s.Slug)
                .IsUnique();

            modelBuilder.Entity<School>()
                .Property(s => s.Slug)
                .HasMaxLength(80);

            modelBuilder.Entity<School>()
                .Property(s => s.Name)
                .HasMaxLength(200);

            modelBuilder.Entity<School>()
                .Property(s => s.ShortName)
                .HasMaxLength(20);

            // SchoolTranslation: one name per school and locale; Russian stays on School itself.
            modelBuilder.Entity<SchoolTranslation>()
                .HasKey(t => new { t.SchoolId, t.Locale });

            modelBuilder.Entity<SchoolTranslation>()
                .Property(t => t.Locale)
                .HasMaxLength(Locales.MaxLength);

            modelBuilder.Entity<SchoolTranslation>()
                .Property(t => t.Name)
                .HasMaxLength(200)
                .IsRequired();

            modelBuilder.Entity<SchoolTranslation>()
                .Property(t => t.ShortName)
                .HasMaxLength(20)
                .IsRequired();

            modelBuilder.Entity<SchoolTranslation>()
                .HasOne(t => t.School)
                .WithMany(s => s.Translations)
                .HasForeignKey(t => t.SchoolId)
                .OnDelete(DeleteBehavior.Cascade);

            // OpinionSchool (composite PK)
            modelBuilder.Entity<OpinionSchool>()
                .HasKey(os => new { os.OpinionId, os.SchoolId });

            modelBuilder.Entity<OpinionSchool>()
                .HasOne(os => os.Opinion)
                .WithMany(o => o.OpinionSchools)
                .HasForeignKey(os => os.OpinionId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<OpinionSchool>()
                .HasOne(os => os.School)
                .WithMany(s => s.OpinionSchools)
                .HasForeignKey(os => os.SchoolId)
                .OnDelete(DeleteBehavior.Cascade);

            // AiProviderSettings
            modelBuilder.Entity<AiProviderSettings>()
                .Property(s => s.BaseUrl)
                .HasMaxLength(512);

            modelBuilder.Entity<AiProviderSettings>()
                .Property(s => s.Model)
                .HasMaxLength(120);

            // User (ex-AdminUser)
            modelBuilder.Entity<User>()
                .HasIndex(u => u.Email)
                .IsUnique();

            modelBuilder.Entity<User>()
                .Property(u => u.Email)
                .HasMaxLength(320);

            modelBuilder.Entity<User>()
                .Property(u => u.ExternalId)
                .HasMaxLength(256);

            modelBuilder.Entity<User>()
                .Property(u => u.Role)
                .HasConversion<string>()
                .HasMaxLength(16)
                .IsRequired();

            // Invite (U-04): single-use, guarded by UsedAtUtc/RevokedAtUtc as concurrency tokens.
            modelBuilder.Entity<Invite>(invite =>
            {
                invite.HasIndex(i => i.TokenHash).IsUnique();
                invite.Property(i => i.TokenHash).HasMaxLength(128).IsRequired();
                invite.Property(i => i.Role).HasConversion<string>().HasMaxLength(16).IsRequired();
                invite.Property(i => i.Note).HasMaxLength(Invite.NoteMaxLength);
                invite.Property(i => i.UsedAtUtc).IsConcurrencyToken();
                invite.Property(i => i.RevokedAtUtc).IsConcurrencyToken();
                invite.HasOne(i => i.CreatedByUser)
                    .WithMany()
                    .HasForeignKey(i => i.CreatedByUserId)
                    .OnDelete(DeleteBehavior.Restrict);
                invite.HasOne(i => i.UsedByUser)
                    .WithMany()
                    .HasForeignKey(i => i.UsedByUserId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            // RefreshSession (U-03): a deleted user takes their sessions with them.
            modelBuilder.Entity<RefreshSession>(session =>
            {
                session.HasIndex(s => s.TokenHash).IsUnique();
                session.HasIndex(s => s.FamilyId);
                session.HasIndex(s => s.UserId);
                session.Property(s => s.TokenHash).HasMaxLength(128).IsRequired();
                session.Property(s => s.UserAgent).HasMaxLength(SessionUserAgentMaxLength);
                session.Property(s => s.IpAddress).HasMaxLength(SessionIpAddressMaxLength);
                session.HasOne(s => s.User)
                    .WithMany()
                    .HasForeignKey(s => s.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
                session.HasOne(s => s.ReplacedBy)
                    .WithMany()
                    .HasForeignKey(s => s.ReplacedById)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            base.OnModelCreating(modelBuilder);
        }
    }
}
