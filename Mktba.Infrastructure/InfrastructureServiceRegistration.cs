using Microsoft.Extensions.DependencyInjection;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Infrastructure
{
    public static class InfrastructureServiceRegistration
    {
        public static IServiceCollection AddInfrastructure(this IServiceCollection services)
        {
            services.AddScoped<ArticleRepository>();
            services.AddScoped<ArticleSearchRepository>();
            services.AddScoped<ParagraphRepository>();
            services.AddScoped<SchoolRepository>();
            services.AddScoped<SourceRepository>();
            services.AddScoped<TagRepository>();
            services.AddScoped<FeedbackRepository>();
            services.AddScoped<AnalyticsEventRepository>();
            services.AddScoped<AiProviderSettingsRepository>();
            services.AddScoped<UserRepository>();
            services.AddScoped<InviteRepository>();
            services.AddScoped<RefreshSessionRepository>();
            services.AddScoped<ArticleDraftRepository>();
            return services;
        }
    }
}
