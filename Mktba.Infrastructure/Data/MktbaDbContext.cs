using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Mktba.Domain.Entities;

namespace Mktba.Infrastructure.Data
{
    public class MktbaDbContext : DbContext
    {
        public MktbaDbContext(DbContextOptions<MktbaDbContext> options)
            : base(options)
        { }

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            // The trash filter on Article (M-11, #133) is meant to hide the article's paragraphs, tags and
            // other required dependents along with it, which is what this warning is about.
            optionsBuilder.ConfigureWarnings(warnings =>
                warnings.Ignore(CoreEventId.PossibleIncorrectRequiredNavigationWithQueryFilterInteractionWarning));
        }

        public DbSet<Article> Articles { get; set; } = null!;
        public DbSet<ArticleInfoboxField> ArticleInfoboxFields { get; set; } = null!;
        public DbSet<ArticleRelatedLink> ArticleRelatedLinks { get; set; } = null!;
        public DbSet<ArticleSlugRedirect> ArticleSlugRedirects { get; set; } = null!;
        public DbSet<DeletedArticleSlug> DeletedArticleSlugs { get; set; } = null!;
        public DbSet<ArticleCoAuthor> ArticleCoAuthors { get; set; } = null!;
        public DbSet<ArticleRevision> ArticleRevisions { get; set; } = null!;
        public DbSet<ArticleStatusChange> ArticleStatusChanges { get; set; } = null!;
        public DbSet<AuditLogEntry> AuditLogEntries { get; set; } = null!;
        public DbSet<ArticleDraft> ArticleDrafts { get; set; } = null!;
        public DbSet<Paragraph> Paragraphs { get; set; } = null!;
        public DbSet<Opinion> Opinions { get; set; } = null!;
        public DbSet<School> Schools { get; set; } = null!;
        public DbSet<SchoolTranslation> SchoolTranslations { get; set; } = null!;
        public DbSet<OpinionSchool> OpinionSchools { get; set; } = null!;
        public DbSet<Source> Sources { get; set; } = null!;
        public DbSet<OpinionSource> OpinionSources { get; set; } = null!;
        public DbSet<Tag> Tags { get; set; } = null!;
        public DbSet<ArticleTag> ArticleTags { get; set; } = null!;
        public DbSet<AiProviderSettings> AiProviderSettings { get; set; } = null!;
        public DbSet<User> Users { get; set; } = null!;
        public DbSet<UserLink> UserLinks { get; set; } = null!;
        public DbSet<Invite> Invites { get; set; } = null!;
        public DbSet<RefreshSession> RefreshSessions { get; set; } = null!;
        public DbSet<FeedbackMessage> FeedbackMessages { get; set; } = null!;
        public DbSet<StoredFile> StoredFiles { get; set; } = null!;
        public DbSet<ScholarApplication> ScholarApplications { get; set; } = null!;
        public DbSet<ScholarApplicationDocument> ScholarApplicationDocuments { get; set; } = null!;
        public DbSet<AnalyticsEvent> AnalyticsEvents { get; set; } = null!;
        public DbSet<AnalyticsDay> AnalyticsDays { get; set; } = null!;
        public DbSet<AnalyticsArticleDay> AnalyticsArticleDays { get; set; } = null!;
        public DbSet<AnalyticsArticleSchoolDay> AnalyticsArticleSchoolDays { get; set; } = null!;
        public DbSet<AnalyticsAuthorDay> AnalyticsAuthorDays { get; set; } = null!;
        public DbSet<AnalyticsTagDay> AnalyticsTagDays { get; set; } = null!;
        public DbSet<AnalyticsSearchDay> AnalyticsSearchDays { get; set; } = null!;
        public DbSet<AnalyticsWebVitalDay> AnalyticsWebVitalDays { get; set; } = null!;

        /// <summary>Longest stored before/after value of an audit log entry (a status or a role name).</summary>
        public const int AuditValueMaxLength = 32;

        /// <summary>Longest stored User-Agent of a refresh session; longer values are cut.</summary>
        public const int SessionUserAgentMaxLength = 256;

        /// <summary>Longest stored client IP of a refresh session (an IPv6 address fits).</summary>
        public const int SessionIpAddressMaxLength = 64;

        /// <summary>Longest edit comment on a revision.</summary>
        public const int RevisionCommentMaxLength = 500;

        /// <summary>Longest comment of a status move (A-04, #87): a reviewer's reason for returning an article.</summary>
        public const int StatusChangeCommentMaxLength = 2000;

        /// <summary>Longest article slug; the slug rules in the application layer use the same limit.</summary>
        public const int ArticleSlugMaxLength = 80;

        /// <summary>Longest SEO title of an article.</summary>
        public const int SeoTitleMaxLength = 70;

        /// <summary>Longest SEO description of an article.</summary>
        public const int SeoDescriptionMaxLength = 160;

        /// <summary>Longest social image URL of an article.</summary>
        public const int SocialImageUrlMaxLength = 2048;

        /// <summary>Longest display name of a user profile.</summary>
        public const int UserDisplayNameMaxLength = 100;

        /// <summary>Longest "about" text of a user profile.</summary>
        public const int UserBioMaxLength = 1000;

        /// <summary>Longest self-declared degree of a user profile.</summary>
        public const int UserDegreeMaxLength = 150;

        /// <summary>Longest self-declared institution of a user profile.</summary>
        public const int UserInstitutionMaxLength = 200;

        /// <summary>Longest label of a profile link.</summary>
        public const int UserLinkLabelMaxLength = 60;

        /// <summary>Longest address of a profile link.</summary>
        public const int UserLinkUrlMaxLength = 2048;

        /// <summary>Longest title of a source.</summary>
        public const int SourceTitleMaxLength = 300;

        /// <summary>Longest author of a source.</summary>
        public const int SourceAuthorMaxLength = 200;

        /// <summary>Longest publication details of a source.</summary>
        public const int SourceDetailsMaxLength = 500;

        /// <summary>Longest URL of a source.</summary>
        public const int SourceUrlMaxLength = 2048;

        /// <summary>Longest locator of a citation (page, hadith number, sura:ayah).</summary>
        public const int SourceLocatorMaxLength = 200;

        /// <summary>Longest tag name; with at most 16 tags an article's search copy stays within its 1000 characters.</summary>
        public const int TagNameMaxLength = 50;

        /// <summary>Longest tag slug, as for articles.</summary>
        public const int TagSlugMaxLength = ArticleSlugMaxLength;

        /// <summary>Longest search copy of an article's tags (column <c>Tags</c>, read by the search vector).</summary>
        public const int ArticleTagsSearchTextMaxLength = 1000;

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

            // A translation outlives its source: once the source is purged it is simply no longer marked outdated (I-06, #110).
            modelBuilder.Entity<Article>()
                .HasOne(a => a.TranslatedFrom)
                .WithMany()
                .HasForeignKey(a => a.TranslatedFromId)
                .OnDelete(DeleteBehavior.SetNull);

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

            // Trash (M-11, #133): a trashed article is invisible to every query unless it asks with
            // IgnoreQueryFilters (the trash itself, slug and file checks, restore and purge).
            modelBuilder.Entity<Article>()
                .HasQueryFilter(a => a.DeletedAt == null);

            modelBuilder.Entity<Article>()
                .HasOne(a => a.DeletedBy)
                .WithMany()
                .HasForeignKey(a => a.DeletedById)
                .OnDelete(DeleteBehavior.SetNull)
                .IsRequired(false);

            modelBuilder.Entity<Article>()
                .HasIndex(a => a.DeletedAt);

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

            // Autosaved drafts (E-02, #75): one per user and article, one per user without an article;
            // they go with their article and with their user.
            modelBuilder.Entity<ArticleDraft>(draft =>
            {
                draft.HasOne(d => d.User)
                    .WithMany()
                    .HasForeignKey(d => d.UserId)
                    .OnDelete(DeleteBehavior.Cascade);

                draft.HasOne(d => d.Article)
                    .WithMany()
                    .HasForeignKey(d => d.ArticleId)
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired(false);

                // NULLS NOT DISTINCT: the new-article draft (no article) is unique per user too.
                draft.HasIndex(d => new { d.UserId, d.ArticleId })
                    .IsUnique()
                    .AreNullsDistinct(false);

                draft.HasIndex(d => d.UpdatedAt);

                draft.Property(d => d.Snapshot)
                    .HasColumnType("jsonb")
                    .IsRequired();
            });

            // Status moves (A-04, #87): append-only log; deleting the article drops it, deleting a user keeps it.
            modelBuilder.Entity<ArticleStatusChange>(change =>
            {
                change.HasOne(c => c.Article)
                    .WithMany()
                    .HasForeignKey(c => c.ArticleId)
                    .OnDelete(DeleteBehavior.Cascade);
                change.HasOne(c => c.ChangedBy)
                    .WithMany()
                    .HasForeignKey(c => c.ChangedById)
                    .OnDelete(DeleteBehavior.SetNull)
                    .IsRequired(false);
                change.Property(c => c.FromStatus).HasConversion<string>().HasMaxLength(16).IsRequired();
                change.Property(c => c.ToStatus).HasConversion<string>().HasMaxLength(16).IsRequired();
                change.Property(c => c.Comment).HasMaxLength(StatusChangeCommentMaxLength);
                change.HasIndex(c => new { c.ArticleId, c.ChangedAt });
            });

            // Audit log (U-09, #135): append-only, plain ids without foreign keys, so an entry outlives
            // the article and the user it names.
            modelBuilder.Entity<AuditLogEntry>(entry =>
            {
                entry.Property(e => e.Action).HasConversion<string>().HasMaxLength(32).IsRequired();
                entry.Property(e => e.FromValue).HasMaxLength(AuditValueMaxLength);
                entry.Property(e => e.ToValue).HasMaxLength(AuditValueMaxLength);
                entry.HasIndex(e => e.OccurredAt);
                entry.HasIndex(e => new { e.ArticleId, e.OccurredAt });
                entry.HasIndex(e => new { e.ActorId, e.OccurredAt });
            });

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

            // The column keeps its old name: the stored generated "SearchVector" reads it (AddArticleSearch).
            modelBuilder.Entity<Article>()
                .Property(a => a.TagsSearchText)
                .HasColumnName("Tags")
                .HasMaxLength(ArticleTagsSearchTextMaxLength);

            // Tags (M-06, #70): one directory per language, name compared case-insensitively.
            modelBuilder.Entity<Tag>(tag =>
            {
                tag.Property(t => t.Locale).HasMaxLength(Locales.MaxLength).IsRequired();
                tag.Property(t => t.Name).HasMaxLength(TagNameMaxLength).IsRequired();
                tag.Property(t => t.NormalizedName).HasMaxLength(TagNameMaxLength).IsRequired();
                tag.Property(t => t.Slug).HasMaxLength(TagSlugMaxLength).IsRequired();
                tag.HasIndex(t => new { t.Locale, t.NormalizedName }).IsUnique();
                tag.HasIndex(t => new { t.Locale, t.Slug }).IsUnique();
            });

            modelBuilder.Entity<ArticleTag>(link =>
            {
                link.HasKey(l => new { l.ArticleId, l.TagId });
                link.HasIndex(l => l.TagId);
                link.HasOne(l => l.Article)
                    .WithMany(a => a.TagLinks)
                    .HasForeignKey(l => l.ArticleId)
                    .OnDelete(DeleteBehavior.Cascade);
                link.HasOne(l => l.Tag)
                    .WithMany(t => t.ArticleLinks)
                    .HasForeignKey(l => l.TagId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

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

            // Scholar opinions (custom schools, M-08 #116): the article one was created for. The entry is
            // shared by every article that uses it, so purging that article keeps it (SetNull).
            modelBuilder.Entity<Article>()
                .HasMany(a => a.CustomSchools)
                .WithOne(s => s.ArticleScope)
                .HasForeignKey(s => s.ArticleScopeId)
                .OnDelete(DeleteBehavior.SetNull)
                .IsRequired(false);

            // The wiki article about the scholar; the entry stays when that article is purged.
            modelBuilder.Entity<School>()
                .HasOne(s => s.ScholarArticle)
                .WithMany()
                .HasForeignKey(s => s.ScholarArticleId)
                .OnDelete(DeleteBehavior.SetNull)
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
                .HasMaxLength(School.SlugMaxLength);

            modelBuilder.Entity<School>()
                .Property(s => s.Name)
                .HasMaxLength(School.NameMaxLength);

            modelBuilder.Entity<School>()
                .Property(s => s.ShortName)
                .HasMaxLength(School.ShortNameMaxLength);

            modelBuilder.Entity<School>()
                .Property(s => s.ScholarName)
                .HasMaxLength(School.ScholarNameMaxLength);

            modelBuilder.Entity<School>()
                .Property(s => s.ScholarYears)
                .HasMaxLength(School.ScholarYearsMaxLength);

            modelBuilder.Entity<School>()
                .Property(s => s.Description)
                .HasMaxLength(School.DescriptionMaxLength);

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

            // Directory of sources and citations (M-07, #71). A cited source cannot be deleted
            // (Restrict); a citation goes with its opinion (Cascade).
            modelBuilder.Entity<Source>(source =>
            {
                source.Property(s => s.Kind).HasConversion<string>().HasMaxLength(32).IsRequired();
                source.Property(s => s.Title).HasMaxLength(SourceTitleMaxLength).IsRequired();
                source.Property(s => s.Author).HasMaxLength(SourceAuthorMaxLength);
                source.Property(s => s.Details).HasMaxLength(SourceDetailsMaxLength);
                source.Property(s => s.Url).HasMaxLength(SourceUrlMaxLength);
            });

            modelBuilder.Entity<OpinionSource>(citation =>
            {
                citation.Property(c => c.Locator).HasMaxLength(SourceLocatorMaxLength);
                citation.HasOne(c => c.Opinion)
                    .WithMany(o => o.Sources)
                    .HasForeignKey(c => c.OpinionId)
                    .OnDelete(DeleteBehavior.Cascade);
                citation.HasOne(c => c.Source)
                    .WithMany(s => s.Citations)
                    .HasForeignKey(c => c.SourceId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

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

            // User profile (U-07): every field optional; the slug is unique among the users who have one.
            modelBuilder.Entity<User>(user =>
            {
                user.Property(u => u.DisplayName).HasMaxLength(UserDisplayNameMaxLength);
                user.Property(u => u.Slug).HasMaxLength(ArticleSlugMaxLength);
                user.HasIndex(u => u.Slug).IsUnique();
                user.Property(u => u.AvatarUrl).HasMaxLength(SocialImageUrlMaxLength);
                user.Property(u => u.Bio).HasMaxLength(UserBioMaxLength);
                user.Property(u => u.Degree).HasMaxLength(UserDegreeMaxLength);
                user.Property(u => u.Institution).HasMaxLength(UserInstitutionMaxLength);
                user.HasMany(u => u.Links)
                    .WithOne()
                    .HasForeignKey(link => link.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<UserLink>(link =>
            {
                link.Property(l => l.Label).HasMaxLength(UserLinkLabelMaxLength).IsRequired();
                link.Property(l => l.Url).HasMaxLength(UserLinkUrlMaxLength).IsRequired();
                link.HasIndex(l => new { l.UserId, l.Order });
            });

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

            // FeedbackMessage (F-02): the row is the delivery queue; Attempts guards a row against two workers.
            modelBuilder.Entity<FeedbackMessage>(feedback =>
            {
                feedback.HasIndex(f => f.DeliveryKey).IsUnique();
                feedback.HasIndex(f => new { f.DeliveryState, f.NextAttemptAtUtc });
                feedback.Property(f => f.Type).HasConversion<string>().HasMaxLength(16).IsRequired();
                feedback.Property(f => f.Text).HasMaxLength(FeedbackMessage.TextMaxLength).IsRequired();
                feedback.Property(f => f.Contact).HasMaxLength(FeedbackMessage.ContactMaxLength);
                feedback.Property(f => f.PageUrl).HasMaxLength(FeedbackMessage.PageUrlMaxLength);
                feedback.Property(f => f.Mazhab).HasMaxLength(FeedbackMessage.MazhabMaxLength);
                feedback.Property(f => f.DeliveryState).HasConversion<string>().HasMaxLength(16).IsRequired();
                feedback.Property(f => f.Attempts).IsConcurrencyToken();
                feedback.Property(f => f.LastError).HasMaxLength(FeedbackMessage.LastErrorMaxLength);
                feedback.Property(f => f.GitHubIssueUrl).HasMaxLength(FeedbackMessage.IssueUrlMaxLength);
                feedback.HasOne(f => f.Article)
                    .WithMany()
                    .HasForeignKey(f => f.ArticleId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            // Own analytics events (N-02, #96): an append-only log without foreign keys, read by time range.
            modelBuilder.Entity<AnalyticsEvent>(analyticsEvent =>
            {
                analyticsEvent.HasIndex(e => e.OccurredAtUtc);
                analyticsEvent.HasIndex(e => new { e.ArticleId, e.OccurredAtUtc });
                // N-03 (#97): repeats within one page view and one visitor's recent views are looked up on intake.
                analyticsEvent.HasIndex(e => e.ViewId);
                analyticsEvent.HasIndex(e => new { e.VisitorId, e.OccurredAtUtc });
                analyticsEvent.Property(e => e.Type).HasConversion<string>().HasMaxLength(32).IsRequired();
                analyticsEvent.Property(e => e.Query).HasMaxLength(AnalyticsEvent.QueryMaxLength);
                analyticsEvent.Property(e => e.TargetPath).HasMaxLength(AnalyticsEvent.TargetPathMaxLength);
            });

            // Daily summaries (N-04, #98): keyed by what a dashboard asks about, then the day; every
            // table is also indexed by the day alone, which a rebuild deletes by and a site-wide
            // dashboard reads by. No foreign keys, like the log they come from.
            modelBuilder.Entity<AnalyticsDay>().HasKey(d => d.Day);
            modelBuilder.Entity<AnalyticsArticleDay>(articleDay =>
            {
                articleDay.HasKey(d => new { d.ArticleId, d.Day });
                articleDay.HasIndex(d => d.Day);
            });
            modelBuilder.Entity<AnalyticsArticleSchoolDay>(schoolDay =>
            {
                schoolDay.HasKey(d => new { d.ArticleId, d.SchoolId, d.Day });
                schoolDay.HasIndex(d => d.Day);
            });
            modelBuilder.Entity<AnalyticsAuthorDay>(authorDay =>
            {
                authorDay.HasKey(d => new { d.UserId, d.Day });
                authorDay.HasIndex(d => d.Day);
            });
            modelBuilder.Entity<AnalyticsTagDay>(tagDay =>
            {
                tagDay.HasKey(d => new { d.TagId, d.Day });
                tagDay.HasIndex(d => d.Day);
            });
            modelBuilder.Entity<AnalyticsSearchDay>(searchDay =>
            {
                searchDay.HasKey(d => new { d.Day, d.Query });
                searchDay.Property(d => d.Query).HasMaxLength(AnalyticsEvent.QueryMaxLength);
            });
            modelBuilder.Entity<AnalyticsWebVitalDay>(vitalDay =>
            {
                vitalDay.HasKey(d => new { d.Day, d.Metric });
                vitalDay.Property(d => d.Metric).HasConversion<string>().HasMaxLength(32);
            });

            // Uploaded files (U-08, #73): the record outlives the file and its uploader.
            modelBuilder.Entity<StoredFile>(file =>
            {
                file.HasIndex(f => f.Name).IsUnique();
                file.HasIndex(f => new { f.DeletedAt, f.UploadedAt });
                file.Property(f => f.Name).HasMaxLength(StoredFile.NameMaxLength).IsRequired();
                file.Property(f => f.ContentType).HasMaxLength(StoredFile.ContentTypeMaxLength).IsRequired();
                file.Property(f => f.Purpose).HasConversion<string>().HasMaxLength(16).IsRequired();
                file.HasOne(f => f.UploadedBy)
                    .WithMany()
                    .HasForeignKey(f => f.UploadedById)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<ScholarApplication>(application =>
            {
                // At most one pending application per user (V-01, #117); the service checks first, this catches a race.
                application.HasIndex(a => a.UserId)
                    .IsUnique()
                    .HasFilter("\"Status\" = 'Pending'")
                    .HasDatabaseName("IX_ScholarApplications_UserId_Pending");
                application.HasIndex(a => new { a.Status, a.SubmittedAt });
                application.Property(a => a.Degree).HasMaxLength(ScholarApplication.DegreeMaxLength).IsRequired();
                application.Property(a => a.Institution).HasMaxLength(ScholarApplication.InstitutionMaxLength).IsRequired();
                application.Property(a => a.Specialization).HasMaxLength(ScholarApplication.SpecializationMaxLength).IsRequired();
                application.Property(a => a.Mazhab).HasMaxLength(ScholarApplication.MazhabMaxLength);
                application.Property(a => a.Status).HasConversion<string>().HasMaxLength(16).IsRequired().IsConcurrencyToken();
                application.Property(a => a.DecisionReason).HasMaxLength(ScholarApplication.ReasonMaxLength);
                application.Property(a => a.RoleBeforeApproval).HasConversion<string>().HasMaxLength(16);
                application.HasOne(a => a.User)
                    .WithMany()
                    .HasForeignKey(a => a.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
                application.HasMany(a => a.Documents)
                    .WithOne(d => d.Application)
                    .HasForeignKey(d => d.ApplicationId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<ScholarApplicationDocument>(document =>
            {
                document.HasIndex(d => new { d.ApplicationId, d.Order }).IsUnique();
                document.HasIndex(d => d.StoredFileId).IsUnique();
                document.Property(d => d.FileName).HasMaxLength(ScholarApplicationDocument.FileNameMaxLength).IsRequired();
                document.HasOne(d => d.StoredFile)
                    .WithMany()
                    .HasForeignKey(d => d.StoredFileId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            base.OnModelCreating(modelBuilder);
        }
    }
}
