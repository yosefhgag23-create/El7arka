using Fleet.Application.Abstractions;
using Fleet.Infrastructure.Persistence;
using Fleet.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Fleet.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config, AppPaths? paths = null)
    {
        paths ??= new AppPaths(config["Fleet:DataRoot"]);
        services.AddSingleton(paths);
        services.AddDbContext<AppDbContext>(o => o.UseSqlite($"Data Source={paths.DatabasePath};Foreign Keys=True"));
        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());
        services.AddSingleton<IClock, SystemClock>();
        services.AddSingleton<IPasswordHasher, Pbkdf2PasswordHasher>();
        services.AddScoped<IFileStorage, LocalFileStorage>();
        services.AddScoped<DbSeeder>();
        services.AddSingleton<Fleet.Application.Reports.IReportRenderer, Reporting.ReportRenderer>();
        services.AddScoped<Backup.BackupService>();
        return services;
    }

    /// <summary>Applies pending migrations (after copying the current database aside), enables WAL, seeds reference data.</summary>
    public static async Task InitializeDatabaseAsync(this IServiceProvider root, CancellationToken ct = default)
    {
        using var scope = root.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<AppDbContext>();
        var paths = sp.GetRequiredService<AppPaths>();
        var log = sp.GetRequiredService<ILoggerFactory>().CreateLogger("Database");

        var pending = (await db.Database.GetPendingMigrationsAsync(ct)).ToList();
        if (pending.Count > 0 && File.Exists(paths.DatabasePath) && new FileInfo(paths.DatabasePath).Length > 0
            && (await db.Database.GetAppliedMigrationsAsync(ct)).Any())
        {
            var copy = Path.Combine(paths.BackupsDir, $"pre-migration-{DateTime.Now:yyyyMMdd-HHmmss}.db");
            await db.Database.ExecuteSqlRawAsync("PRAGMA wal_checkpoint(TRUNCATE);", ct);
            File.Copy(paths.DatabasePath, copy);
            log.LogInformation("Pre-migration copy saved to {Path}", copy);
        }

        await db.Database.MigrateAsync(ct);
        await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;", ct);
        await sp.GetRequiredService<DbSeeder>().SeedAsync(ct);
        if (pending.Count > 0) log.LogInformation("Applied migrations: {Migrations}", string.Join(", ", pending));
    }
}
