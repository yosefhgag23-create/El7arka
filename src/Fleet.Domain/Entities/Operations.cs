using Fleet.Domain.Common;
using Fleet.Domain.Enums;

namespace Fleet.Domain.Entities;

public class FuelTransaction : SoftDeletableEntity
{
    public int EquipmentId { get; set; }
    public Equipment? Equipment { get; set; }
    public int? ProjectId { get; set; }
    public Project? Project { get; set; }
    public int? DriverId { get; set; }
    public Driver? Driver { get; set; }
    public int FuelTypeId { get; set; }
    public FuelType? FuelType { get; set; }
    public DateOnly FuelDate { get; set; }
    public decimal Quantity { get; set; }
    public decimal PricePerUnit { get; set; }
    public decimal TotalAmount { get; set; }
    public decimal? MeterReading { get; set; }
    public bool IsFullTank { get; set; } = true;
    public string? Station { get; set; }
    public int? AttachmentId { get; set; }
    public Attachment? Attachment { get; set; }
    public string? Notes { get; set; }
}

public class MaintenanceRecord : SoftDeletableEntity
{
    public int EquipmentId { get; set; }
    public Equipment? Equipment { get; set; }
    public int? ProjectId { get; set; }
    public Project? Project { get; set; }
    public int MaintenanceTypeId { get; set; }
    public MaintenanceType? MaintenanceType { get; set; }
    public DateOnly MaintenanceDate { get; set; }
    public decimal? MeterReading { get; set; }
    public string? Description { get; set; }
    public string? Workshop { get; set; }
    public decimal PartsCost { get; set; }
    public decimal LaborCost { get; set; }
    public decimal OtherCost { get; set; }
    public decimal TotalCost { get; set; }
    public int? DowntimeDays { get; set; }
    public DateOnly? NextDueDate { get; set; }
    public decimal? NextDueMeter { get; set; }
    public int? AttachmentId { get; set; }
    public Attachment? Attachment { get; set; }
    public string? Notes { get; set; }
}

public class MaintenancePlan : AuditableEntity
{
    public int EquipmentId { get; set; }
    public Equipment? Equipment { get; set; }
    public int MaintenanceTypeId { get; set; }
    public MaintenanceType? MaintenanceType { get; set; }
    public int? IntervalKm { get; set; }
    public int? IntervalHours { get; set; }
    public int? IntervalDays { get; set; }
    public DateOnly? LastDoneDate { get; set; }
    public decimal? LastDoneMeter { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Notes { get; set; }
}

public class OvertimeRate : AuditableEntity
{
    /// <summary>Null = company default rate.</summary>
    public int? DriverId { get; set; }
    public Driver? Driver { get; set; }
    public decimal HourlyRate { get; set; }
    public DateOnly EffectiveFrom { get; set; }
    public DateOnly? EffectiveTo { get; set; }
    public string? Notes { get; set; }
}

public class OvertimeRecord : SoftDeletableEntity
{
    public int DriverId { get; set; }
    public Driver? Driver { get; set; }
    public int? EquipmentId { get; set; }
    public Equipment? Equipment { get; set; }
    public int? ProjectId { get; set; }
    public Project? Project { get; set; }
    public DateOnly WorkDate { get; set; }
    public decimal NormalHours { get; set; }
    public decimal OvertimeHours { get; set; }
    public decimal HourlyRate { get; set; }
    public decimal Amount { get; set; }
    public string? Description { get; set; }
    public ApprovalStatus ApprovalStatus { get; set; } = ApprovalStatus.Pending;
    public DateTime? ApprovedAt { get; set; }
    public string? ApprovedBy { get; set; }
}

/// <summary>
/// The single cost ledger. All cash cost figures are computed from this table only.
/// Rows with SourceType != Manual are owned by their source record and are read-only.
/// </summary>
public class Expense : SoftDeletableEntity
{
    public int? EquipmentId { get; set; }
    public Equipment? Equipment { get; set; }
    public int? ProjectId { get; set; }
    public Project? Project { get; set; }
    public int CategoryId { get; set; }
    public ExpenseCategory? Category { get; set; }
    public DateOnly ExpenseDate { get; set; }
    public decimal Amount { get; set; }
    public decimal? Quantity { get; set; }
    public decimal? UnitPrice { get; set; }
    public decimal? MeterReading { get; set; }
    public string? Description { get; set; }
    public ExpenseSourceType SourceType { get; set; } = ExpenseSourceType.Manual;
    public int? SourceId { get; set; }

    /// <summary>For rental accruals: first day of the accrued month.</summary>
    public DateOnly? PeriodStart { get; set; }
    public DateOnly? PeriodEnd { get; set; }

    public int? AttachmentId { get; set; }
    public Attachment? Attachment { get; set; }
    public string? Notes { get; set; }
}
