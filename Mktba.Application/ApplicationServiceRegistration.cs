using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Mktba.Application.Configuration;
using Mktba.Application.Services;
using Mktba.Application.Services.Accounts;
using Mktba.Application.Services.Analytics;
using Mktba.Application.Services.Email;
using Mktba.Application.Services.Feedback;
using Mktba.Application.Services.IndexNow;
using Mktba.Application.Services.Notifications;
using Mktba.Application.Services.Uploads;

namespace Mktba.Application
{
    public static class ApplicationServiceRegistration
    {
        public static IServiceCollection AddApplication(this IServiceCollection services)
        {
            services.AddScoped<ArticleService>();
            services.AddScoped<ParagraphService>();
            services.AddScoped<SchoolService>();
            services.AddScoped<SourceService>();
            services.AddScoped<TagService>();
            services.AddScoped<NavigationTreeService>();
            services.AddScoped<SitemapService>();
            services.AddScoped<RecentArticlesService>();
            services.AddScoped<PopularArticlesService>();
            services.AddScoped<AuthorArticlesService>();
            services.AddScoped<ArticleSearchService>();
            services.AddScoped<ISearchResultCounter>(provider => provider.GetRequiredService<ArticleSearchService>());
            services.AddScoped<ArticleContentService>();
            services.AddScoped<ArticleRevisionService>();
            services.AddScoped<ArticleDraftService>();
            services.AddScoped<ArticleAuthorshipService>();
            services.TryAddSingleton(TimeProvider.System);
            services.AddScoped<AdminService>();
            services.AddScoped<SessionService>();
            services.AddScoped<AdminAuthService>();
            services.AddScoped<InviteService>();
            services.AddScoped<UserAdminService>();
            services.AddScoped<AuditLogService>();
            services.AddScoped<UserProfileService>();
            services.AddScoped<UserActivityService>();
            services.AddScoped<FeedbackService>();
            services.AddScoped<AnalyticsEventService>();
            services.AddScoped<AnalyticsAggregationService>();
            services.AddScoped<SiteAnalyticsService>();
            services.AddScoped<AuthorAnalyticsService>();
            services.AddScoped<ArticleAnalyticsService>();
            services.AddScoped<SearchAnalyticsService>();
            services.AddScoped<ContentAnalyticsService>();
            services.AddScoped<ImageUploadService>();
            services.AddScoped<UploadCleanupService>();
            services.AddScoped<Mktba.Application.Services.Verification.ScholarApplicationService>();
            services.AddScoped<Mktba.Application.Services.Verification.ScholarApplicationReviewService>();
            services.AddScoped<Mktba.Application.Services.Verification.ArticleReviewService>();
            services.AddScoped<Mktba.Application.Services.Verification.ArticleRemarkService>();
            services.AddScoped<NotificationService>();
            services.AddScoped<NotificationEmailService>();
            services.AddScoped<ReaderAccountService>();
            services.AddScoped<AccountEmailService>();
            // V-09 (#125): the mail server when Email:Smtp and Email:SiteUrl are set, else the log.
            services.AddSingleton<IEmailSender>(provider => provider.GetRequiredService<IOptions<EmailOptions>>().Value.SendsThroughSmtp
                ? new SmtpEmailSender(provider.GetRequiredService<IOptions<EmailOptions>>())
                : new LogEmailSender(provider.GetRequiredService<ILogger<LogEmailSender>>()));
            services.AddScoped<FeedbackDeliveryService>();
            services.AddSingleton<IFeedbackIssueTracker, GitHubIssueClient>();
            services.AddSingleton<IndexNowQueue>();
            services.AddSingleton<Mktba.Application.Services.Observability.ClientErrorService>();
            services.AddSingleton<ISearchEngineNotifier>(provider => provider.GetRequiredService<IndexNowQueue>());
            services.AddSingleton<IIndexNowClient, IndexNowClient>();
            return services;
        }
    }
}
