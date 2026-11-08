using Fleet.Domain.Enums;

namespace Fleet.Application.Common;

/// <summary>Arabic display names for enums used in exported reports (the UI has its own copy for screens).</summary>
public static class Labels
{
    public static string Of(OwnershipType v) => v == OwnershipType.Owned ? "تمليك" : "إيجار";

    public static string Of(MeterType v) => v == MeterType.EngineHours ? "ساعات تشغيل" : "كيلومتر";

    public static string Unit(MeterType v) => v == MeterType.EngineHours ? "ساعة" : "كم";

    public static string Of(EquipmentStatus v) => v switch
    {
        EquipmentStatus.Available => "متاحة",
        EquipmentStatus.Operating => "تعمل",
        EquipmentStatus.UnderMaintenance => "تحت الصيانة",
        EquipmentStatus.OutOfService => "خارج الخدمة",
        _ => "غير نشطة",
    };

    public static string Of(ProjectStatus v) => v switch
    {
        ProjectStatus.Planned => "مخطط",
        ProjectStatus.Active => "جارٍ",
        ProjectStatus.OnHold => "متوقف مؤقتاً",
        ProjectStatus.Completed => "منتهي",
        _ => "مؤرشف",
    };

    public static string Of(EmploymentStatus v) => v switch
    {
        EmploymentStatus.Active => "على رأس العمل",
        EmploymentStatus.OnLeave => "إجازة",
        EmploymentStatus.Suspended => "موقوف",
        _ => "انتهت خدمته",
    };

    public static string Of(ApprovalStatus v) => v switch
    {
        ApprovalStatus.Approved => "معتمد",
        ApprovalStatus.Rejected => "مرفوض",
        _ => "قيد المراجعة",
    };

    public static string Of(ExpenseSourceType v) => v switch
    {
        ExpenseSourceType.Fuel => "وقود",
        ExpenseSourceType.Maintenance => "صيانة",
        ExpenseSourceType.Overtime => "إضافي",
        ExpenseSourceType.Rental => "إيجار",
        _ => "يدوي",
    };

    public static string Of(RentalRateType v) => v switch
    {
        RentalRateType.Monthly => "شهري",
        RentalRateType.Daily => "يومي",
        RentalRateType.Hourly => "بالساعة",
        _ => "بالكيلومتر",
    };

    public static string Of(MaintenanceDueStatus v) => v switch
    {
        MaintenanceDueStatus.Overdue => "متأخرة",
        MaintenanceDueStatus.DueSoon => "قريباً",
        _ => "في الموعد",
    };

    public static string Of(MeterReadingSource v) => v switch
    {
        MeterReadingSource.Initial => "قراءة ابتدائية",
        MeterReadingSource.Fuel => "تموين",
        MeterReadingSource.Maintenance => "صيانة",
        MeterReadingSource.Transfer => "نقل",
        MeterReadingSource.Expense => "مصروف",
        MeterReadingSource.Correction => "تصحيح",
        _ => "يدوي",
    };
}
