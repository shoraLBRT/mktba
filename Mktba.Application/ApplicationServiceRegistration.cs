using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Mktba.Application.Services;

namespace Mktba.Application
{
    public static class ApplicationServiceRegistration
    {
        public static IServiceCollection AddApplication(this IServiceCollection services)
        {
            services.AddScoped<ArticleService>();
            services.AddScoped<ParagraphService>();
            services.AddScoped<SchoolService>();
            services.AddScoped<NavigationTreeService>();
            services.AddScoped<SitemapService>();
            services.AddScoped<RecentArticlesService>();
            services.AddScoped<ArticleContentService>();
            services.AddScoped<ArticleRevisionService>();
            services.AddScoped<ArticleAuthorshipService>();
            services.TryAddSingleton(TimeProvider.System);
            services.AddScoped<AdminService>();
            services.AddScoped<SessionService>();
            services.AddScoped<AdminAuthService>();
            services.AddScoped<InviteService>();
            services.AddScoped<UserAdminService>();
            return services;
        }
    }
}
