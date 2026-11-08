using Fleet.Application.Abstractions;
using Fleet.Domain.Entities;
using Fleet.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Infrastructure.Persistence;

/// <summary>Seeds required reference data (idempotent). Never inserts business/sample records.</summary>
public class DbSeeder(AppDbContext db, IPasswordHasher hasher)
{
    public const string DefaultAdminUser = "admin";
    public const string DefaultAdminPassword = "admin123";

    public async Task SeedAsync(CancellationToken ct = default)
    {
        if (!await db.ExpenseCategories.AnyAsync(ct))
        {
            var cats = new (string Ar, string En, ExpenseSystemKind Kind)[]
            {
                ("سولار", "Diesel", ExpenseSystemKind.Fuel),
                ("بنزين", "Gasoline", ExpenseSystemKind.Fuel),
                ("وقود آخر", "Other Fuel", ExpenseSystemKind.Fuel),
                ("زيوت", "Oil", ExpenseSystemKind.Oil),
                ("صيانة", "Maintenance", ExpenseSystemKind.Maintenance),
                ("إطارات", "Tires", ExpenseSystemKind.Tires),
                ("قطع غيار", "Spare Parts", ExpenseSystemKind.SpareParts),
                ("كارتة الطرق", "Road Tolls", ExpenseSystemKind.Tolls),
                ("إيجار معدات", "Rental Fees", ExpenseSystemKind.Rental),
                ("ساعات إضافية للسائقين", "Driver Overtime", ExpenseSystemKind.Overtime),
                ("نقل وانتقالات", "Transportation", ExpenseSystemKind.None),
                ("مصروفات أخرى", "Other Expenses", ExpenseSystemKind.None),
            };
            db.ExpenseCategories.AddRange(cats.Select((c, i) => new ExpenseCategory
            {
                NameAr = c.Ar, NameEn = c.En, SystemKind = c.Kind, SortOrder = i + 1,
                IsSystem = c.Kind is ExpenseSystemKind.Fuel or ExpenseSystemKind.Maintenance or ExpenseSystemKind.SpareParts
                    or ExpenseSystemKind.Rental or ExpenseSystemKind.Overtime
            }));
            await db.SaveChangesAsync(ct);
        }

        if (!await db.FuelTypes.AnyAsync(ct))
        {
            var cats = await db.ExpenseCategories.ToListAsync(ct);
            int Cat(string en) => cats.First(c => c.NameEn == en).Id;
            db.FuelTypes.AddRange(
                new FuelType { NameAr = "سولار", NameEn = "Diesel", Unit = "لتر", ExpenseCategoryId = Cat("Diesel"), SortOrder = 1, IsSystem = true },
                new FuelType { NameAr = "بنزين", NameEn = "Gasoline", Unit = "لتر", ExpenseCategoryId = Cat("Gasoline"), SortOrder = 2, IsSystem = true },
                new FuelType { NameAr = "غاز طبيعي", NameEn = "Natural Gas", Unit = "م³", ExpenseCategoryId = Cat("Other Fuel"), SortOrder = 3 },
                new FuelType { NameAr = "كهرباء", NameEn = "Electric", Unit = "ك.و.س", ExpenseCategoryId = Cat("Other Fuel"), SortOrder = 4 },
                new FuelType { NameAr = "أخرى", NameEn = "Other", Unit = "لتر", ExpenseCategoryId = Cat("Other Fuel"), SortOrder = 5 });
        }

        if (!await db.EquipmentCategories.AnyAsync(ct))
        {
            var items = new (string Ar, string En, string Icon, int Life)[]
            {
                ("نقل ثقيل", "Trucks", "local_shipping", 8),
                ("لوادر", "Loaders", "front_loader", 10),
                ("حفارات", "Excavators", "construction", 10),
                ("جرارات", "Tractors", "agriculture", 10),
                ("سيارات ملاكي", "Cars", "directions_car", 5),
                ("سيارات نصف نقل", "Pickups", "airport_shuttle", 6),
                ("أتوبيسات", "Buses", "directions_bus", 8),
                ("معدات أخرى", "Other equipment", "precision_manufacturing", 8),
            };
            db.EquipmentCategories.AddRange(items.Select((x, i) => new EquipmentCategory
            {
                NameAr = x.Ar, NameEn = x.En, Icon = x.Icon, SortOrder = i + 1, DefaultUsefulLifeYears = x.Life, DefaultResidualPercent = 10
            }));
        }

        if (!await db.MaintenanceTypes.AnyAsync(ct))
        {
            var items = new (string Ar, string En, int? Km, int? Hours, int? Days)[]
            {
                ("تغيير زيت الموتور", "Engine Oil Change", 5000, 250, 90),
                ("تغيير فلتر الزيت", "Oil Filter Replacement", 5000, 250, 90),
                ("تغيير فلتر الهواء", "Air Filter Replacement", 15000, 500, 180),
                ("تغيير فلتر السولار", "Fuel Filter Replacement", 10000, 500, 180),
                ("تغيير الإطارات", "Tire Replacement", 60000, null, null),
                ("تغيير البطارية", "Battery Replacement", null, null, 730),
                ("صيانة الفرامل", "Brake Maintenance", 20000, null, 365),
                ("إصلاح الموتور", "Engine Repair", null, null, null),
                ("صيانة كهرباء", "Electrical Maintenance", null, null, null),
                ("صيانة الهيدروليك", "Hydraulic System Maintenance", null, 1000, 365),
                ("صيانة عامة", "General Maintenance", null, null, 180),
                ("أخرى", "Other", null, null, null),
            };
            db.MaintenanceTypes.AddRange(items.Select((x, i) => new MaintenanceType
            {
                NameAr = x.Ar, NameEn = x.En, DefaultIntervalKm = x.Km, DefaultIntervalHours = x.Hours, DefaultIntervalDays = x.Days, SortOrder = i + 1
            }));
        }

        if (!await db.LicenseTypes.AnyAsync(ct))
        {
            string[] names = ["رخصة خاصة", "رخصة مهنية درجة أولى", "رخصة مهنية درجة ثانية", "رخصة مهنية درجة ثالثة", "رخصة قيادة معدات ثقيلة"];
            db.LicenseTypes.AddRange(names.Select((n, i) => new LicenseType { NameAr = n, SortOrder = i + 1 }));
        }

        if (!await db.EquipmentStatusLabels.AnyAsync(ct))
        {
            db.EquipmentStatusLabels.AddRange(
                new EquipmentStatusLabel { Status = EquipmentStatus.Available, NameAr = "متاحة", NameEn = "Available", Color = "#15803D" },
                new EquipmentStatusLabel { Status = EquipmentStatus.Operating, NameAr = "تعمل", NameEn = "Operating", Color = "#18181B" },
                new EquipmentStatusLabel { Status = EquipmentStatus.UnderMaintenance, NameAr = "تحت الصيانة", NameEn = "Under Maintenance", Color = "#B45309" },
                new EquipmentStatusLabel { Status = EquipmentStatus.OutOfService, NameAr = "خارج الخدمة", NameEn = "Out of Service", Color = "#B91C1C" },
                new EquipmentStatusLabel { Status = EquipmentStatus.Inactive, NameAr = "غير نشطة", NameEn = "Inactive", Color = "#71717A" });
        }

        if (!await db.CompanySettings.AnyAsync(ct))
            db.CompanySettings.Add(new CompanySettings { CompanyName = "اسم الشركة" });

        if (!await db.Users.AnyAsync(ct))
        {
            db.Users.Add(new AppUser
            {
                Username = DefaultAdminUser,
                DisplayName = "مدير النظام",
                PasswordHash = hasher.Hash(DefaultAdminPassword),
                Role = UserRole.Admin,
                MustChangePassword = true
            });
        }

        await db.SaveChangesAsync(ct);
    }
}
