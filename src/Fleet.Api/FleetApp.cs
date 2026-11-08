using System.Text.Json.Serialization;
using Fleet.Api.Endpoints;
using Fleet.Api.Infrastructure;
using Fleet.Application;
using Fleet.Application.Abstractions;
using Fleet.Application.Equipments;
using Fleet.Infrastructure;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Serilog;

namespace Fleet.Api;

/// <summary>Builds the local web application. Used by the console host (Program) and the desktop shell (Fleet.Desktop).</summary>
public static class FleetApp
{
    public const int DefaultPort = 5080;

    /// <param name="urls">Overrides the listening address (the desktop shell picks a free local port).</param>
    public static WebApplication Build(string[] args, string? urls = null)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args,
            ContentRootPath = AppContext.BaseDirectory,
        });

        var paths = new AppPaths(builder.Configuration["Fleet:DataRoot"]);

        builder.Host.UseSerilog((ctx, cfg) => cfg
            .ReadFrom.Configuration(ctx.Configuration)
            .MinimumLevel.Information()
            .MinimumLevel.Override("Microsoft", Serilog.Events.LogEventLevel.Warning)
            .MinimumLevel.Override("Microsoft.EntityFrameworkCore", Serilog.Events.LogEventLevel.Warning)
            .WriteTo.Console()
            .WriteTo.File(Path.Combine(paths.LogsDir, "fleet-.log"), rollingInterval: RollingInterval.Day, retainedFileCountLimit: 30));

        if (!builder.Environment.IsEnvironment("Testing"))
            builder.WebHost.UseUrls(urls ?? $"http://127.0.0.1:{builder.Configuration.GetValue("Fleet:Port", DefaultPort)}");

        const long maxUpload = 2L * 1024 * 1024 * 1024;
        builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = maxUpload);
        builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(o => o.MultipartBodyLengthLimit = maxUpload);

        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();
        builder.Services.AddApplication();
        builder.Services.AddInfrastructure(builder.Configuration, paths);
        if (!builder.Environment.IsEnvironment("Testing"))
            builder.Services.AddHostedService<AutoBackupWorker>();

        var dataProtection = builder.Services.AddDataProtection()
            .SetApplicationName("El7arka")
            .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(paths.Root, "keys")));
        if (OperatingSystem.IsWindows()) dataProtection.ProtectKeysWithDpapi();

        builder.Services.ConfigureHttpJsonOptions(o =>
        {
            o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
            o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
        });
        builder.Services.AddOpenApi();
        builder.Services.AddProblemDetails();
        builder.Services.AddExceptionHandler<AppExceptionHandler>();

        builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(o =>
            {
                o.Cookie.Name = "el7arka.auth";
                o.Cookie.HttpOnly = true;
                o.Cookie.SameSite = SameSiteMode.Strict;
                o.SlidingExpiration = true;
                o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
                o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
            });
        builder.Services.AddAuthorization(o =>
            o.FallbackPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

        var app = builder.Build();

        app.UseExceptionHandler();
        app.UseSerilogRequestLogging(o => o.GetLevel = (ctx, _, ex) =>
            ex != null || ctx.Response.StatusCode >= 500 ? Serilog.Events.LogEventLevel.Error : Serilog.Events.LogEventLevel.Debug);
        app.UseDefaultFiles();
        app.UseStaticFiles();
        if (app.Environment.IsDevelopment())
        {
            app.UseSwaggerUI(o =>
            {
                o.SwaggerEndpoint("/openapi/v1.json", "El7arka API");
                o.DocumentTitle = "El7arka API";
            });
        }
        app.UseAuthentication();
        app.UseAuthorization();

        if (app.Environment.IsDevelopment())
            app.MapOpenApi().AllowAnonymous();

        app.MapGet("/api/health", () => Results.Ok(new { status = "ok", time = DateTime.Now })).AllowAnonymous();
        app.MapAuth();
        app.MapSettings();
        app.MapFleet();
        app.MapOperations();
        app.MapReports();
        app.MapBackups();
        app.MapFallbackToFile("index.html").AllowAnonymous();
        return app;
    }

    /// <summary>Migrates/seeds the database, adds development sample data when enabled, and posts due rental accruals.</summary>
    public static async Task InitializeAsync(WebApplication app)
    {
        await app.Services.InitializeDatabaseAsync();

        if (app.Environment.IsDevelopment() && app.Configuration.GetValue("Fleet:SampleData", false))
        {
            try { await SampleDataSeeder.SeedAsync(app.Services, app.Logger); }
            catch (Exception ex) { app.Logger.LogError(ex, "Sample data seeding failed"); }
        }

        try
        {
            using var scope = app.Services.CreateScope();
            await scope.ServiceProvider.GetRequiredService<RentalAccrualService>().RunAllAsync();
        }
        catch (Exception ex)
        {
            app.Logger.LogError(ex, "Rental accrual on startup failed");
        }
    }
}
