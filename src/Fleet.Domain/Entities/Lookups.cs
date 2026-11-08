using Fleet.Domain.Common;
using Fleet.Domain.Enums;

namespace Fleet.Domain.Entities;

public class EquipmentCategory : LookupEntity
{
    public string? Icon { get; set; }
    public int? DefaultUsefulLifeYears { get; set; }
    public decimal? DefaultResidualPercent { get; set; }
}

public class FuelType : LookupEntity
{
    /// <summary>Unit label, e.g. "لتر", "ك.و.س", "م³".</summary>
    public string Unit { get; set; } = "لتر";

    /// <summary>Ledger category that fuel transactions of this type post to.</summary>
    public int ExpenseCategoryId { get; set; }
    public ExpenseCategory? ExpenseCategory { get; set; }
}

public class ExpenseCategory : LookupEntity
{
    public ExpenseSystemKind SystemKind { get; set; }
}

public class MaintenanceType : LookupEntity
{
    public int? DefaultIntervalKm { get; set; }
    public int? DefaultIntervalHours { get; set; }
    public int? DefaultIntervalDays { get; set; }
}

public class LicenseType : LookupEntity
{
}

/// <summary>Display label/color for a fixed status. Semantics are not configurable.</summary>
public class EquipmentStatusLabel : Entity
{
    public EquipmentStatus Status { get; set; }
    public string NameAr { get; set; } = "";
    public string? NameEn { get; set; }
    public string Color { get; set; } = "#71717A";
}
