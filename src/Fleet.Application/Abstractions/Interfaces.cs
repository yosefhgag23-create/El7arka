using Fleet.Domain.Entities;
using Fleet.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace Fleet.Application.Abstractions;

public interface IAppDbContext
{
    DbSet<EquipmentCategory> EquipmentCategories { get; }
    DbSet<FuelType> FuelTypes { get; }
    DbSet<ExpenseCategory> ExpenseCategories { get; }
    DbSet<MaintenanceType> MaintenanceTypes { get; }
    DbSet<LicenseType> LicenseTypes { get; }
    DbSet<EquipmentStatusLabel> EquipmentStatusLabels { get; }

    DbSet<Project> Projects { get; }
    DbSet<Equipment> Equipment { get; }
    DbSet<EquipmentImage> EquipmentImages { get; }
    DbSet<DepreciationProfile> DepreciationProfiles { get; }
    DbSet<RentalContract> RentalContracts { get; }
    DbSet<ProjectAssignment> ProjectAssignments { get; }
    DbSet<EquipmentTransfer> EquipmentTransfers { get; }
    DbSet<EquipmentStatusHistory> EquipmentStatusHistory { get; }
    DbSet<MeterReading> MeterReadings { get; }
    DbSet<Driver> Drivers { get; }
    DbSet<DriverAssignment> DriverAssignments { get; }

    DbSet<FuelTransaction> FuelTransactions { get; }
    DbSet<MaintenanceRecord> MaintenanceRecords { get; }
    DbSet<MaintenancePlan> MaintenancePlans { get; }
    DbSet<OvertimeRate> OvertimeRates { get; }
    DbSet<OvertimeRecord> OvertimeRecords { get; }
    DbSet<Expense> Expenses { get; }

    DbSet<Attachment> Attachments { get; }
    DbSet<CompanySettings> CompanySettings { get; }
    DbSet<AppUser> Users { get; }
    DbSet<AuditLog> AuditLogs { get; }
    DbSet<BackupLog> BackupLogs { get; }

    DatabaseFacade Database { get; }
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}

public interface ICurrentUser
{
    int? UserId { get; }
    string? UserName { get; }
    UserRole? Role { get; }
    bool IsAdmin => Role == UserRole.Admin;
}

public interface IClock
{
    DateTime UtcNow { get; }
    DateOnly Today { get; }
}

public interface IFileStorage
{
    Task<Attachment> SaveAsync(Stream content, string fileName, string contentType, AttachmentOwnerType ownerType, int? ownerId, CancellationToken ct = default);
    Stream OpenRead(Attachment attachment);
    string GetFullPath(Attachment attachment);
    string RootPath { get; }
}

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string password, string hash);
}
