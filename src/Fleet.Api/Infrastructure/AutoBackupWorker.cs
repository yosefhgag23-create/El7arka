using Fleet.Infrastructure.Backup;

namespace Fleet.Api.Infrastructure;

/// <summary>Checks hourly and creates the daily automatic backup when due (also shortly after startup).</summary>
public class AutoBackupWorker(IServiceScopeFactory scopes, ILogger<AutoBackupWorker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken); }
        catch (OperationCanceledException) { return; }

        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                var created = await scope.ServiceProvider.GetRequiredService<BackupService>().RunAutoIfDueAsync(stoppingToken);
                if (created is not null) log.LogInformation("Automatic backup created: {File}", created.FileName);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { log.LogError(ex, "Automatic backup failed"); }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
    }
}
