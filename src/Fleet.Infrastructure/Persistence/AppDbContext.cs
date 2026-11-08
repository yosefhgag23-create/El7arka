using System.Linq.Expressions;
using System.Text.Json;
using Fleet.Application.Abstractions;
using Fleet.Domain.Common;
using Fleet.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace Fleet.Infrastructure.Persistence;

public class AppDbContext(DbContextOptions<AppDbContext> options, ICurrentUser? currentUser = null, IClock? clock = null)
    : DbContext(options), IAppDbContext
{
    public DbSet<EquipmentCategory> EquipmentCategories => Set<EquipmentCategory>();
    public DbSet<FuelType> FuelTypes => Set<FuelType>();
    public DbSet<ExpenseCategory> ExpenseCategories => Set<ExpenseCategory>();
    public DbSet<MaintenanceType> MaintenanceTypes => Set<MaintenanceType>();
    public DbSet<LicenseType> LicenseTypes => Set<LicenseType>();
    public DbSet<EquipmentStatusLabel> EquipmentStatusLabels => Set<EquipmentStatusLabel>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Equipment> Equipment => Set<Equipment>();
    public DbSet<EquipmentImage> EquipmentImages => Set<EquipmentImage>();
    public DbSet<DepreciationProfile> DepreciationProfiles => Set<DepreciationProfile>();
    public DbSet<RentalContract> RentalContracts => Set<RentalContract>();
    public DbSet<ProjectAssignment> ProjectAssignments => Set<ProjectAssignment>();
    public DbSet<EquipmentTransfer> EquipmentTransfers => Set<EquipmentTransfer>();
    public DbSet<EquipmentStatusHistory> EquipmentStatusHistory => Set<EquipmentStatusHistory>();
    public DbSet<MeterReading> MeterReadings => Set<MeterReading>();
    public DbSet<Driver> Drivers => Set<Driver>();
    public DbSet<DriverAssignment> DriverAssignments => Set<DriverAssignment>();
    public DbSet<FuelTransaction> FuelTransactions => Set<FuelTransaction>();
    public DbSet<MaintenanceRecord> MaintenanceRecords => Set<MaintenanceRecord>();
    public DbSet<MaintenancePlan> MaintenancePlans => Set<MaintenancePlan>();
    public DbSet<OvertimeRate> OvertimeRates => Set<OvertimeRate>();
    public DbSet<OvertimeRecord> OvertimeRecords => Set<OvertimeRecord>();
    public DbSet<Expense> Expenses => Set<Expense>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<CompanySettings> CompanySettings => Set<CompanySettings>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<BackupLog> BackupLogs => Set<BackupLog>();

    protected override void ConfigureConventions(ModelConfigurationBuilder builder)
    {
        // SQLite cannot ORDER BY / aggregate decimal (TEXT). REAL keeps 15 significant digits,
        // which is exact for 2-decimal money values below 10^12; services round results to 2 decimals.
        builder.Properties<decimal>().HaveConversion<double>();
        builder.Properties<decimal?>().HaveConversion<double?>();
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);

        foreach (var entityType in b.Model.GetEntityTypes())
        {
            if (!typeof(ISoftDeletable).IsAssignableFrom(entityType.ClrType)) continue;
            var param = Expression.Parameter(entityType.ClrType, "e");
            var body = Expression.Not(Expression.Property(param, nameof(ISoftDeletable.IsDeleted)));
            b.Entity(entityType.ClrType).HasQueryFilter(Expression.Lambda(body, param));
        }

        foreach (var fk in b.Model.GetEntityTypes().SelectMany(e => e.GetForeignKeys()))
            fk.DeleteBehavior = DeleteBehavior.Restrict;
    }

    public override async Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        var now = clock?.UtcNow ?? DateTime.UtcNow;
        var user = currentUser?.UserName;
        var audits = new List<(EntityEntry Entry, AuditLog Log)>();

        foreach (var entry in ChangeTracker.Entries())
        {
            if (entry.Entity is AuditableEntity a)
            {
                if (entry.State == EntityState.Added) { a.CreatedAt = now; a.CreatedBy = user; }
                else if (entry.State == EntityState.Modified) { a.UpdatedAt = now; a.UpdatedBy = user; }
            }

            if (entry.Entity is AuditLog or BackupLog || entry.State is EntityState.Unchanged or EntityState.Detached)
                continue;

            var action = entry.State switch
            {
                EntityState.Added => "Create",
                EntityState.Deleted => "Delete",
                _ when entry.Entity is ISoftDeletable { IsDeleted: true } && entry.Property(nameof(ISoftDeletable.IsDeleted)).IsModified => "SoftDelete",
                _ => "Update"
            };
            audits.Add((entry, new AuditLog
            {
                Timestamp = now,
                User = user,
                EntityName = entry.Metadata.ClrType.Name,
                Action = action,
                Changes = SerializeChanges(entry)
            }));
        }

        var result = await base.SaveChangesAsync(ct);

        if (audits.Count > 0)
        {
            foreach (var (entry, log) in audits)
            {
                log.EntityId = entry.Properties.FirstOrDefault(p => p.Metadata.IsPrimaryKey())?.CurrentValue?.ToString() ?? "";
                AuditLogs.Add(log);
            }
            await base.SaveChangesAsync(ct);
        }
        return result;
    }

    private static string? SerializeChanges(EntityEntry entry)
    {
        var props = entry.State == EntityState.Modified
            ? entry.Properties.Where(p => p.IsModified && !Equals(p.OriginalValue, p.CurrentValue))
            : entry.Properties;
        var dict = props
            .Where(p => p.Metadata.Name is not nameof(AppUser.PasswordHash))
            .ToDictionary(
                p => p.Metadata.Name,
                p => entry.State == EntityState.Modified ? new { from = p.OriginalValue, to = p.CurrentValue } : (object?)p.CurrentValue);
        return dict.Count == 0 ? null : JsonSerializer.Serialize(dict);
    }
}
