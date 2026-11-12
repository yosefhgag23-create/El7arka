namespace Fleet.Domain.Enums;

public enum OwnershipType { Owned = 1, Rented = 2 }

public enum MeterType { Kilometers = 1, EngineHours = 2 }

public enum EquipmentStatus { Available = 1, Operating = 2, UnderMaintenance = 3, OutOfService = 4, Inactive = 5 }

public enum ProjectStatus { Planned = 1, Active = 2, OnHold = 3, Completed = 4, Archived = 5 }

public enum EmploymentStatus { Active = 1, OnLeave = 2, Suspended = 3, Terminated = 4 }

public enum ExpenseSourceType { Manual = 1, Fuel = 2, Maintenance = 3, Overtime = 4, Rental = 5 }

/// <summary>Links a configurable expense category to system postings.</summary>
public enum ExpenseSystemKind
{
    None = 0, Fuel = 1, Maintenance = 2, SpareParts = 3, Rental = 4, Overtime = 5, Tolls = 6, Tires = 7, Oil = 8
}

public enum MeterReadingSource { Initial = 1, Fuel = 2, Maintenance = 3, Transfer = 4, Expense = 5, Manual = 6, Correction = 7 }

public enum ApprovalStatus { Pending = 1, Approved = 2, Rejected = 3 }

public enum RentalRateType { Monthly = 1, Daily = 2, Hourly = 3, PerKm = 4 }

public enum DepreciationMethod { StraightLine = 1 }

public enum UserRole { Admin = 1, DataEntry = 2 }

public enum AttachmentOwnerType
{
    None = 0, EquipmentImage = 1, Driver = 2, Expense = 3, Fuel = 4, Maintenance = 5, RentalContract = 6, CompanyLogo = 7, EquipmentLicense = 8
}

public enum MaintenanceDueStatus { Ok = 1, DueSoon = 2, Overdue = 3 }

public enum FuelSegmentStatus
{
    Valid = 1,
    NoPreviousFullTank = 2,
    MissingMeter = 3,
    NonPositiveDistance = 4,
    CorrectionInSegment = 5,
    NotFullTank = 6
}
