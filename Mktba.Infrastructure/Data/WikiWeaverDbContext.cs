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
        public DbSet<Paragraph> Paragraphs { get; set; } = null!;
        public DbSet<Opinion> Opinions { get; set; } = null!;
        public DbSet<School> Schools { get; set; } = null!;
        public DbSet<OpinionSchool> OpinionSchools { get; set; } = null!;
        public DbSet<AiProviderSettings> AiProviderSettings { get; set; } = null!;
        public DbSet<User> Users { get; set; } = null!;
        public DbSet<AdminInviteToken> AdminInviteTokens { get; set; } = null!;

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // Article hierarchy
            modelBuilder.Entity<Article>()
                .HasMany(a => a.ChildArticles)
                .WithOne(a => a.ParentArticle)
                .HasForeignKey(a => a.ParentArticleId)
                .OnDelete(DeleteBehavior.Restrict);

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

            // AdminInviteToken
            modelBuilder.Entity<AdminInviteToken>()
                .HasIndex(t => t.TokenHash)
                .IsUnique();

            modelBuilder.Entity<AdminInviteToken>()
                .Property(t => t.TokenHash)
                .HasMaxLength(128);

            modelBuilder.Entity<AdminInviteToken>()
                .HasOne(t => t.CreatedByUser)
                .WithMany()
                .HasForeignKey(t => t.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<AdminInviteToken>()
                .HasOne(t => t.UsedByUser)
                .WithMany()
                .HasForeignKey(t => t.UsedByUserId)
                .OnDelete(DeleteBehavior.Restrict);

            base.OnModelCreating(modelBuilder);
        }
    }
}
