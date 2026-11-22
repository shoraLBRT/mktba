using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Mktba.Application.Services;
using Mktba.Application.Services.Analytics;
using Mktba.Application.Services.Feedback;
using Mktba.Application.Services.IndexNow;
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
            services.AddScoped<UserProfileService>();
            services.AddScoped<UserActivityService>();
            services.AddScoped<FeedbackService>();
            services.AddScoped<AnalyticsEventService>();
            services.AddScoped<AnalyticsAggregationService>();
            services.AddScoped<SiteAnalyticsService>();
            services.AddScoped<AuthorAnalyticsService>();
            services.AddScoped<SearchAnalyticsService>();
            services.AddScoped<ImageUploadService>();
            services.AddScoped<UploadCleanupService>();
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
