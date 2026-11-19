using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.Text;
using System.Text.Json.Serialization;
using Mktba.Application;
using Mktba.Application.Configuration;
using Mktba.Application.Mappings;
using Mktba.Infrastructure;
using Mktba.Infrastructure.Data;
using Mktba.Infrastructure.UnitOfWork;
using Mktba.Api.Endpoints;
using Mktba.Api.Infrastructure;
using Mktba.Api.Middleware;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddLocalSettingsFile();

builder.Services.AddDbContext<MktbaDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddInfrastructure();
builder.Services.AddApplication();
builder.Services.Configure<AdminOptions>(builder.Configuration.GetSection(AdminOptions.SectionName));
builder.Services.Configure<AuthOptions>(builder.Configuration.GetSection(AuthOptions.SectionName));

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

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowMktbaReact", policy =>
    {
        policy.SetIsOriginAllowed(origin =>
            Uri.TryCreate(origin, UriKind.Absolute, out var uri)
            && (uri.IsLoopback || string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase)))
        .AllowAnyMethod()
        .AllowAnyHeader()
        .AllowCredentials();
    });
});

builder.Services.AddHttpClient();
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

var app = builder.Build();

// The OpenApi environment only generates the OpenAPI document (see mktba.react `npm run gen:api`)
// and must not touch the database.
if (!app.Environment.IsEnvironment(OpenApiEnvironmentName))
{
    // Demonstration-only seed data to make navigation/content visible in fresh local environments.
    using var scope = app.Services.CreateScope();
    var dbContext = scope.ServiceProvider.GetRequiredService<MktbaDbContext>();
    // Integration tests run the API on a non-relational (InMemory) provider, which has no migrations.
    if (dbContext.Database.IsRelational())
    {
        await dbContext.Database.MigrateAsync();
    }
    else
    {
        await dbContext.Database.EnsureCreatedAsync();
    }
    await DemoDataSeeder.SeedAsync(dbContext);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseMiddleware<ExceptionHandlingMiddleware>();
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}
app.UseCors("AllowMktbaReact");
app.UseAuthentication();
app.UseAuthorization();
// After authentication: the AI policy partitions by user id.
app.UseRateLimiter();

app.MapArticleContentEndpoints();
app.MapNavigationEndpoints();
app.MapArticleEndpoints();
app.MapParagraphEndpoints();
app.MapSchoolEndpoints();
app.MapAdminEndpoints();
app.MapAuthEndpoints();
app.MapUserEndpoints();
app.MapInviteEndpoints();
app.MapSearchEndpoints();

app.Run();

public partial class Program
{
    private const string OpenApiEnvironmentName = "OpenApi";
}

