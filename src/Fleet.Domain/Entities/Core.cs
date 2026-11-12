using Fleet.Domain.Common;
using Fleet.Domain.Enums;

namespace Fleet.Domain.Entities;

public class Project : AuditableEntity
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Location { get; set; }
    public string? Description { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public ProjectStatus Status { get; set; } = ProjectStatus.Active;
    public string? Notes { get; set; }

    public List<ProjectAssignment> Assignments { get; set; } = [];
}

public class Equipment : AuditableEntity
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? PlateNumber { get; set; }
    public string? ChassisNumber { get; set; }
    public int CategoryId { get; set; }
    public EquipmentCategory? Category { get; set; }
    public string? Manufacturer { get; set; }
    public string? Model { get; set; }
    public int? ManufactureYear { get; set; }
    public int FuelTypeId { get; set; }
    public FuelType? FuelType { get; set; }
    public OwnershipType Ownership { get; set; }
    public MeterType MeterType { get; set; } = MeterType.Kilometers;
    public EquipmentStatus Status { get; set; } = EquipmentStatus.Available;
    public decimal InitialMeterReading { get; set; }

    /// <summary>Denormalized; maintained exclusively by the meter-reading service.</summary>
    public decimal CurrentMeterReading { get; set; }

    public string? LicenseNumber { get; set; }
    public DateOnly? LicenseExpiryDate { get; set; }
    public int? LicenseAttachmentId { get; set; }

    public int? MainImageId { get; set; }
    public Attachment? MainImage { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;

    public DepreciationProfile? DepreciationProfile { get; set; }
    public List<RentalContract> RentalContracts { get; set; } = [];
    public List<EquipmentImage> Images { get; set; } = [];
    public List<ProjectAssignment> ProjectAssignments { get; set; } = [];
    public List<DriverAssignment> DriverAssignments { get; set; } = [];
}

public class EquipmentImage : Entity
{
    public int EquipmentId { get; set; }
    public int AttachmentId { get; set; }
    public Attachment? Attachment { get; set; }
    public int SortOrder { get; set; }
}

public class DepreciationProfile : AuditableEntity
{
    public int EquipmentId { get; set; }
    public Equipment? Equipment { get; set; }
    public DateOnly PurchaseDate { get; set; }
    public decimal PurchasePrice { get; set; }
    public decimal ResidualValue { get; set; }
    public int UsefulLifeMonths { get; set; }
    public DepreciationMethod Method { get; set; } = DepreciationMethod.StraightLine;
    public DateOnly DepreciationStartDate { get; set; }
    public DateOnly? DisposalDate { get; set; }
}

public class RentalContract : SoftDeletableEntity
{
    public int EquipmentId { get; set; }
    public Equipment? Equipment { get; set; }
    public string? ContractNo { get; set; }
    public string Lessor { get; set; } = "";
    public string? LessorPhone { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public RentalRateType RateType { get; set; }
    public decimal Rate { get; set; }
    public bool IncludesDriver { get; set; }
    public bool IncludesFuel { get; set; }
    public bool IncludesMaintenance { get; set; }
    public int? AttachmentId { get; set; }
    public string? Notes { get; set; }

    public DateRange Period => new(StartDate, EndDate);
}

public class ProjectAssignment : AuditableEntity
{
    public int EquipmentId { get; set; }
    public Equipment? Equipment { get; set; }
    public int ProjectId { get; set; }
    public Project? Project { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public decimal? StartMeter { get; set; }
    public decimal? EndMeter { get; set; }
    public int? TransferId { get; set; }
    public string? Notes { get; set; }

    public DateRange Period => new(StartDate, EndDate);
}

public class EquipmentTransfer : AuditableEntity
{
    public int EquipmentId { get; set; }
    public Equipment? Equipment { get; set; }
    public int? FromProjectId { get; set; }
    public Project? FromProject { get; set; }
    public int? ToProjectId { get; set; }
    public Project? ToProject { get; set; }
    public DateOnly TransferDate { get; set; }
    public decimal? MeterReading { get; set; }
    public string? Notes { get; set; }
}

public class EquipmentStatusHistory : AuditableEntity
{
    public int EquipmentId { get; set; }
    public EquipmentStatus Status { get; set; }
    public DateOnly FromDate { get; set; }
    public DateOnly? ToDate { get; set; }
    public string? Reason { get; set; }
}

public class MeterReading : AuditableEntity
{
    public int EquipmentId { get; set; }
    public DateOnly ReadingDate { get; set; }
    public decimal Value { get; set; }
    public MeterReadingSource Source { get; set; }
    public int? SourceId { get; set; }
    public bool IsCorrection { get; set; }
    public string? CorrectionReason { get; set; }
}

public class Driver : AuditableEntity
{
    public string FullName { get; set; } = "";
    public string? NationalId { get; set; }
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public EmploymentStatus EmploymentStatus { get; set; } = EmploymentStatus.Active;
    public DateOnly? HireDate { get; set; }
    public string? LicenseNumber { get; set; }
    public int? LicenseTypeId { get; set; }
    public LicenseType? LicenseType { get; set; }
    public DateOnly? LicenseExpiryDate { get; set; }
    public int? PhotoId { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;

    public List<DriverAssignment> Assignments { get; set; } = [];
}

public class DriverAssignment : AuditableEntity
{
    public int DriverId { get; set; }
    public Driver? Driver { get; set; }
    public int EquipmentId { get; set; }
    public Equipment? Equipment { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public bool IsPrimary { get; set; }
    public string? Notes { get; set; }

    public DateRange Period => new(StartDate, EndDate);
}
