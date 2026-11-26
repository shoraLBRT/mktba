using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.Text;
using System.Text.Json.Serialization;
using Mktba.Application;
using Mktba.Application.Configuration;
using Mktba.Application.Mappings;
using Mktba.Application.Services.IndexNow;
using Mktba.Infrastructure;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.Storage;
using Mktba.Infrastructure.UnitOfWork;
using Mktba.Api.Endpoints;
using Mktba.Api.Infrastructure;
using Mktba.Api.Middleware;
using Mktba.Api.Observability;

// `--health-probe` asks the running API for its readiness and exits: the container healthcheck (X-05, #159).
if (HealthProbe.IsRequested(args))
{
    Environment.ExitCode = await HealthProbe.RunAsync(HealthProbe.Target(Environment.GetEnvironmentVariable("ASPNETCORE_HTTP_PORTS")));
    return;
}

// `--migrate` applies the migrations and exits instead of serving (X-03, #65; DatabaseStartup).
var (migrateOnly, hostArgs) = DatabaseStartup.ParseArgs(args);
var builder = WebApplication.CreateBuilder(hostArgs);
builder.Configuration.AddLocalSettingsFile();

builder.Services.AddDbContext<MktbaDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddInfrastructure();
builder.Services.AddApplication();
builder.Services.Configure<AdminOptions>(builder.Configuration.GetSection(AdminOptions.SectionName));
builder.Services.Configure<AnalyticsOptions>(builder.Configuration.GetSection(AnalyticsOptions.SectionName));
builder.Services.Configure<AuthOptions>(builder.Configuration.GetSection(AuthOptions.SectionName));
builder.Services.Configure<EmailOptions>(builder.Configuration.GetSection(EmailOptions.SectionName));
builder.Services.Configure<FeedbackOptions>(builder.Configuration.GetSection(FeedbackOptions.SectionName));
builder.Services.Configure<IndexNowOptions>(builder.Configuration.GetSection(IndexNowOptions.SectionName));
builder.Services.Configure<UploadOptions>(builder.Configuration.GetSection(UploadOptions.SectionName));
builder.Services.Configure<ClientErrorOptions>(builder.Configuration.GetSection(ClientErrorOptions.SectionName));
builder.Services.AddFileStorage(
    builder.Configuration.GetSection(FileStorageOptions.SectionName).Get<FileStorageOptions>() ?? new FileStorageOptions(),
    builder.Environment.ContentRootPath);

builder.Services.AddScoped<IUnitOfWork, UnitOfWork>();
builder.Services.AddAutoMapper(
    cfg => { },
    typeof(MappingProfile)
);
builder.Services.AddEndpointsApiExplorer();
// Request binding failures throw, so ExceptionHandlingMiddleware answers them with a problem body.
builder.Services.Configure<RouteHandlerOptions>(options => options.ThrowOnBadRequest = true);

// Настройка JSON сериализации для обработки циклических ссылок
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    // Enums travel as their names ("Published"), not numbers.
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});
// Swagger reads the MVC JSON options, so the OpenAPI contract shows enums as names too.
builder.Services.Configure<Microsoft.AspNetCore.Mvc.JsonOptions>(options =>
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// Loopback for local development plus the site origins in Cors:AllowedOrigins (X-01, #63).
builder.Services.AddMktbaCors(builder.Configuration);

builder.Services.AddHttpClient();
builder.Services.AddHttpClient(IndexNowClient.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(15));
builder.Services.AddSwaggerGen(options =>
{
    // Fixed title and version: the document is committed (mktba.react/src/shared/api/openapi.json),
    // so it must not change with the assembly version.
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "Mktba API", Version = "v1" });
    options.SupportNonNullableReferenceTypes();
    options.SchemaFilter<NonNullablePropertiesRequiredSchemaFilter>();
});
var authOptions = builder.Configuration.GetSection(AuthOptions.SectionName).Get<AuthOptions>() ?? new AuthOptions();
// The OpenApi environment only writes the OpenAPI document and never issues or validates tokens.
if (!builder.Environment.IsEnvironment(OpenApiEnvironmentName))
{
    var signingKeyError = JwtSigningKeyPolicy.Validate(authOptions.JwtSigningKey, builder.Environment.IsDevelopment());
    if (signingKeyError is not null)
    {
        throw new InvalidOperationException(signingKeyError);
    }
}

builder.Services.AddScoped<JwtProblemEvents>();
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ValidIssuer = authOptions.JwtIssuer,
            ValidAudience = authOptions.JwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(authOptions.JwtSigningKey)),
            ClockSkew = TimeSpan.FromMinutes(1),
        };

        options.EventsType = typeof(JwtProblemEvents);
    });

builder.Services.AddAuthorizationBuilder().AddMktbaPolicies();
builder.Services.AddArticleAccess();

builder.Services.AddMktbaRateLimiting(builder.Configuration);

// Observability (X-05, #159; README «Наблюдаемость»): /health/live and /health/ready, and alerts to the
// owner's Telegram chat, off until Alerts:Telegram is configured.
builder.Services.AddMktbaHealthChecks();
builder.Services.AddMktbaAlerts(builder.Configuration);

// The OpenApi environment has no database to deliver from.
if (!builder.Environment.IsEnvironment(OpenApiEnvironmentName))
{
    builder.Services.AddHostedService<FeedbackDeliveryWorker>();
    builder.Services.AddHostedService<NotificationEmailWorker>();
    builder.Services.AddHostedService<IndexNowWorker>();
    builder.Services.AddHostedService<ArticleDraftCleanupWorker>();
    builder.Services.AddHostedService<UploadCleanupWorker>();
    builder.Services.AddHostedService<AnalyticsAggregationWorker>();
}

var app = builder.Build();

if (migrateOnly)
{
    await DatabaseStartup.MigrateAsync(app.Services);
    return;
}

// The OpenApi environment only generates the OpenAPI document (see mktba.react `npm run gen:api`)
// and must not touch the database.
if (!app.Environment.IsEnvironment(OpenApiEnvironmentName))
{
    await DatabaseStartup.PrepareAsync(app.Services, app.Configuration);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// First: everything after it, the rate limiter included, sees the visitor's address.
app.UseMktbaForwardedHeaders(app.Configuration);
app.UseMktbaSecurityHeaders();
// Outside the exception handler: it logs the status the handler wrote.
app.UseMiddleware<RequestLoggingMiddleware>();
app.UseMiddleware<ExceptionHandlingMiddleware>();
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}
app.UseCors(CorsSetup.PolicyName);
app.UseAuthentication();
app.UseAuthorization();
// After authentication: the AI policy partitions by user id.
app.UseRateLimiter();

app.MapArticleContentEndpoints();
app.MapArticleDraftEndpoints();
app.MapNavigationEndpoints();
app.MapArticleEndpoints();
app.MapParagraphEndpoints();
app.MapSchoolEndpoints();
app.MapSourceEndpoints();
app.MapTagEndpoints();
app.MapAdminEndpoints();
app.MapAuthEndpoints();
app.MapUserEndpoints();
app.MapAuditLogEndpoints();
app.MapProfileEndpoints();
app.MapInviteEndpoints();
app.MapSearchEndpoints();
app.MapFeedbackEndpoints();
app.MapAnalyticsEndpoints();
app.MapSeoEndpoints();
app.MapUploadEndpoints();
app.MapScholarApplicationEndpoints();
app.MapScholarApplicationReviewEndpoints();
app.MapArticleReviewEndpoints();
app.MapArticleRemarkEndpoints();
app.MapNotificationEndpoints();
app.MapClientErrorEndpoints();
app.MapHealthEndpoints();

app.Run();

public partial class Program
{
    private const string OpenApiEnvironmentName = "OpenApi";
}

