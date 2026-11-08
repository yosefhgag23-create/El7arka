using Fleet.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Fleet.Infrastructure.Persistence;

internal class ProjectConfig : IEntityTypeConfiguration<Project>
{
    public void Configure(EntityTypeBuilder<Project> b)
    {
        b.Property(x => x.Code).HasMaxLength(50).IsRequired();
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.HasIndex(x => x.Code).IsUnique();
        b.HasIndex(x => x.Status);
    }
}

internal class EquipmentConfig : IEntityTypeConfiguration<Equipment>
{
    public void Configure(EntityTypeBuilder<Equipment> b)
    {
        b.Property(x => x.Code).HasMaxLength(50).IsRequired();
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.PlateNumber).HasMaxLength(50);
        b.Property(x => x.ChassisNumber).HasMaxLength(100);
        b.HasIndex(x => x.Code).IsUnique();
        b.HasIndex(x => x.PlateNumber).IsUnique().HasFilter("PlateNumber IS NOT NULL");
        b.HasIndex(x => x.ChassisNumber).IsUnique().HasFilter("ChassisNumber IS NOT NULL");
        b.HasIndex(x => x.Status);
        b.HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId);
        b.HasOne(x => x.FuelType).WithMany().HasForeignKey(x => x.FuelTypeId);
        b.HasOne(x => x.MainImage).WithMany().HasForeignKey(x => x.MainImageId);
        b.HasOne(x => x.DepreciationProfile).WithOne(x => x.Equipment).HasForeignKey<DepreciationProfile>(x => x.EquipmentId);
        b.HasMany(x => x.RentalContracts).WithOne(x => x.Equipment).HasForeignKey(x => x.EquipmentId);
        b.HasMany(x => x.Images).WithOne().HasForeignKey(x => x.EquipmentId);
        b.HasMany(x => x.ProjectAssignments).WithOne(x => x.Equipment).HasForeignKey(x => x.EquipmentId);
        b.HasMany(x => x.DriverAssignments).WithOne(x => x.Equipment).HasForeignKey(x => x.EquipmentId);
    }
}

internal class ProjectAssignmentConfig : IEntityTypeConfiguration<ProjectAssignment>
{
    public void Configure(EntityTypeBuilder<ProjectAssignment> b)
    {
        b.HasOne(x => x.Project).WithMany(x => x.Assignments).HasForeignKey(x => x.ProjectId);
        // Database-level guarantee: at most one active assignment per equipment.
        b.HasIndex(x => x.EquipmentId).IsUnique().HasFilter("EndDate IS NULL").HasDatabaseName("UX_ProjectAssignment_Active");
        b.HasIndex(x => new { x.EquipmentId, x.StartDate });
        b.HasIndex(x => x.ProjectId);
    }
}

internal class EquipmentTransferConfig : IEntityTypeConfiguration<EquipmentTransfer>
{
    public void Configure(EntityTypeBuilder<EquipmentTransfer> b)
    {
        b.HasOne(x => x.FromProject).WithMany().HasForeignKey(x => x.FromProjectId);
        b.HasOne(x => x.ToProject).WithMany().HasForeignKey(x => x.ToProjectId);
        b.HasIndex(x => new { x.EquipmentId, x.TransferDate });
    }
}

internal class StatusHistoryConfig : IEntityTypeConfiguration<EquipmentStatusHistory>
{
    public void Configure(EntityTypeBuilder<EquipmentStatusHistory> b)
    {
        b.HasOne<Equipment>().WithMany().HasForeignKey(x => x.EquipmentId);
        b.HasIndex(x => new { x.EquipmentId, x.FromDate });
    }
}

internal class MeterReadingConfig : IEntityTypeConfiguration<MeterReading>
{
    public void Configure(EntityTypeBuilder<MeterReading> b)
    {
        b.HasOne<Equipment>().WithMany().HasForeignKey(x => x.EquipmentId);
        b.HasIndex(x => new { x.EquipmentId, x.ReadingDate });
        b.HasIndex(x => new { x.Source, x.SourceId });
    }
}

internal class DriverConfig : IEntityTypeConfiguration<Driver>
{
    public void Configure(EntityTypeBuilder<Driver> b)
    {
        b.Property(x => x.FullName).HasMaxLength(200).IsRequired();
        b.HasIndex(x => x.NationalId).IsUnique().HasFilter("NationalId IS NOT NULL");
        b.HasOne(x => x.LicenseType).WithMany().HasForeignKey(x => x.LicenseTypeId);
        b.HasMany(x => x.Assignments).WithOne(x => x.Driver).HasForeignKey(x => x.DriverId);
        b.HasOne<Attachment>().WithMany().HasForeignKey(x => x.PhotoId);
    }
}

internal class DriverAssignmentConfig : IEntityTypeConfiguration<DriverAssignment>
{
    public void Configure(EntityTypeBuilder<DriverAssignment> b)
    {
        b.HasIndex(x => new { x.EquipmentId, x.StartDate });
        b.HasIndex(x => new { x.DriverId, x.StartDate });
    }
}

internal class FuelConfig : IEntityTypeConfiguration<FuelTransaction>
{
    public void Configure(EntityTypeBuilder<FuelTransaction> b)
    {
        b.HasIndex(x => new { x.EquipmentId, x.FuelDate });
        b.HasIndex(x => x.ProjectId);
        b.HasIndex(x => x.FuelDate);
    }
}

internal class MaintenanceConfig : IEntityTypeConfiguration<MaintenanceRecord>
{
    public void Configure(EntityTypeBuilder<MaintenanceRecord> b)
    {
        b.HasIndex(x => new { x.EquipmentId, x.MaintenanceDate });
        b.HasIndex(x => x.MaintenanceDate);
    }
}

internal class MaintenancePlanConfig : IEntityTypeConfiguration<MaintenancePlan>
{
    public void Configure(EntityTypeBuilder<MaintenancePlan> b)
    {
        b.HasIndex(x => new { x.EquipmentId, x.MaintenanceTypeId }).IsUnique();
    }
}

internal class OvertimeRecordConfig : IEntityTypeConfiguration<OvertimeRecord>
{
    public void Configure(EntityTypeBuilder<OvertimeRecord> b)
    {
        b.HasIndex(x => new { x.DriverId, x.WorkDate });
        b.HasIndex(x => x.WorkDate);
    }
}

internal class ExpenseConfig : IEntityTypeConfiguration<Expense>
{
    public void Configure(EntityTypeBuilder<Expense> b)
    {
        b.HasIndex(x => x.ExpenseDate);
        b.HasIndex(x => new { x.SourceType, x.SourceId });
        b.HasIndex(x => x.ProjectId);
        b.HasIndex(x => x.EquipmentId);
        b.HasIndex(x => x.CategoryId);
    }
}

internal class FuelTypeConfig : IEntityTypeConfiguration<FuelType>
{
    public void Configure(EntityTypeBuilder<FuelType> b) =>
        b.HasOne(x => x.ExpenseCategory).WithMany().HasForeignKey(x => x.ExpenseCategoryId);
}

internal class StatusLabelConfig : IEntityTypeConfiguration<EquipmentStatusLabel>
{
    public void Configure(EntityTypeBuilder<EquipmentStatusLabel> b) => b.HasIndex(x => x.Status).IsUnique();
}

internal class UserConfig : IEntityTypeConfiguration<AppUser>
{
    public void Configure(EntityTypeBuilder<AppUser> b)
    {
        b.Property(x => x.Username).HasMaxLength(50).IsRequired();
        b.HasIndex(x => x.Username).IsUnique();
    }
}

internal class AttachmentConfig : IEntityTypeConfiguration<Attachment>
{
    public void Configure(EntityTypeBuilder<Attachment> b) => b.HasIndex(x => new { x.OwnerType, x.OwnerId });
}

internal class AuditLogConfig : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> b) => b.HasIndex(x => new { x.EntityName, x.EntityId });
}
