using Microsoft.Extensions.DependencyInjection;
using Mktba.Infrastructure.Repositories;

namespace Mktba.Infrastructure
{
    public static class InfrastructureServiceRegistration
    {
        public static IServiceCollection AddInfrastructure(this IServiceCollection services)
        {
            services.AddScoped<ArticleRepository>();
            services.AddScoped<ParagraphRepository>();
            services.AddScoped<SchoolRepository>();
            services.AddScoped<AiProviderSettingsRepository>();
            services.AddScoped<UserRepository>();
            services.AddScoped<AdminInviteTokenRepository>();
            return services;
        }
    }
}
