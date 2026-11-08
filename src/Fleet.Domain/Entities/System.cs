using Fleet.Domain.Common;
using Fleet.Domain.Enums;

namespace Fleet.Domain.Entities;

public class Attachment : Entity
{
    public string OriginalName { get; set; } = "";
    public string StoredPath { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long SizeBytes { get; set; }
    public string Sha256 { get; set; } = "";
    public AttachmentOwnerType OwnerType { get; set; }
    public int? OwnerId { get; set; }
    public DateTime UploadedAt { get; set; }
    public string? UploadedBy { get; set; }
}

public class CompanySettings : Entity
{
    public string CompanyName { get; set; } = "";
    public string? Address { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? TaxNumber { get; set; }
    public int? LogoAttachmentId { get; set; }
    public string Currency { get; set; } = "EGP";
    public string CurrencySymbol { get; set; } = "ج.م";
    public string DateFormat { get; set; } = "dd/MM/yyyy";
    public decimal DefaultWorkingHours { get; set; } = 8;
    public decimal FuelAnomalyThresholdPercent { get; set; } = 25;
    public int MaintenanceDueSoonDays { get; set; } = 14;
    public int MaintenanceDueSoonKm { get; set; } = 500;
    public int MaintenanceDueSoonHours { get; set; } = 25;
    public int LicenseExpiryWarningDays { get; set; } = 30;
    public bool AutoAssignSetsOperating { get; set; } = true;
    public bool AutoBackupEnabled { get; set; } = true;
    public int AutoBackupRetention { get; set; } = 14;
    public string? BackupFolder { get; set; }
    public bool RentalAccrueCurrentMonth { get; set; } = true;
}

public class AppUser : AuditableEntity
{
    public string Username { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public UserRole Role { get; set; }
    public bool IsActive { get; set; } = true;
    public bool MustChangePassword { get; set; }
    public DateTime? LastLoginAt { get; set; }
}

public class AuditLog : Entity
{
    public DateTime Timestamp { get; set; }
    public string? User { get; set; }
    public string EntityName { get; set; } = "";
    public string EntityId { get; set; } = "";
    public string Action { get; set; } = "";
    public string? Changes { get; set; }
}

public class BackupLog : Entity
{
    public DateTime CreatedAt { get; set; }
    public string FilePath { get; set; } = "";
    public long SizeBytes { get; set; }
    public bool IsAutomatic { get; set; }
    public string? CreatedBy { get; set; }
    public string? Notes { get; set; }
}
