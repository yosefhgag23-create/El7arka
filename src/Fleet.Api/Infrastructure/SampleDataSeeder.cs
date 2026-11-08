using Fleet.Application.Abstractions;
using Fleet.Application.Assignments;
using Fleet.Application.Drivers;
using Fleet.Application.Equipments;
using Fleet.Application.Expenses;
using Fleet.Application.Fuel;
using Fleet.Application.Maintenance;
using Fleet.Application.Overtime;
using Fleet.Application.Projects;
using Fleet.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Api.Infrastructure;

/// <summary>
/// Development-only demo data. Every record is clearly marked: codes start with "DEMO-" and names end with "(تجريبي)".
/// Enabled with Fleet:SampleData=true in appsettings.Development.json and only runs on an empty database.
/// Data is created through the application services so ledger postings and validations are identical to real usage.
/// </summary>
public static class SampleDataSeeder
{
    private const string Tag = " (تجريبي)";

    public static async Task SeedAsync(IServiceProvider root, ILogger log, CancellationToken ct = default)
    {
        using var scope = root.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<IAppDbContext>();
        if (await db.Projects.AnyAsync(ct) || await db.Equipment.AnyAsync(ct)) return;

        var today = sp.GetRequiredService<IClock>().Today;
        var start = today.AddDays(-150);
        DateOnly Day(int offset) => start.AddDays(offset);

        int Cat(string en) => db.EquipmentCategories.First(c => c.NameEn == en).Id;
        int Fuel(string en) => db.FuelTypes.First(c => c.NameEn == en).Id;
        int Maint(string en) => db.MaintenanceTypes.First(c => c.NameEn == en).Id;
        int Exp(string en) => db.ExpenseCategories.First(c => c.NameEn == en).Id;
        var licenseType = db.LicenseTypes.OrderBy(x => x.SortOrder).Skip(1).First().Id;

        var projects = sp.GetRequiredService<ProjectService>();
        var equipment = sp.GetRequiredService<EquipmentService>();
        var rentals = sp.GetRequiredService<RentalContractService>();
        var drivers = sp.GetRequiredService<DriverService>();
        var assignments = sp.GetRequiredService<AssignmentService>();
        var fuel = sp.GetRequiredService<FuelService>();
        var maintenance = sp.GetRequiredService<MaintenanceService>();
        var expenses = sp.GetRequiredService<ExpenseService>();
        var overtime = sp.GetRequiredService<OvertimeService>();

        var p1 = await projects.CreateAsync(new ProjectInput("DEMO-P01", "طريق القاهرة الإقليمي" + Tag, "القليوبية", "أعمال رصف وتسوية", Day(0), null, ProjectStatus.Active, null), ct);
        var p2 = await projects.CreateAsync(new ProjectInput("DEMO-P02", "مجمع سكني العاصمة" + Tag, "العاصمة الإدارية", "أعمال حفر وأساسات", Day(10), null, ProjectStatus.Active, null), ct);
        var p3 = await projects.CreateAsync(new ProjectInput("DEMO-P03", "توسعة ميناء دمياط" + Tag, "دمياط", null, Day(30), null, ProjectStatus.OnHold, null), ct);

        DepreciationProfileDto Dep(decimal price, int months, int purchasedDaysAgo) =>
            new(today.AddDays(-purchasedDaysAgo), price, Math.Round(price * 0.1m), months, DepreciationMethod.StraightLine, today.AddDays(-purchasedDaysAgo), null);

        var fleet = new List<(int Id, MeterType Type, decimal Initial, decimal PerDay, int Project, int FuelType, decimal Litres)>();
        async Task Add(string code, string name, string plate, string cat, string fuelType, OwnershipType own, MeterType mt, decimal initial,
            decimal perDay, int project, decimal litres, DepreciationProfileDto? dep, string? maker = null, string? model = null, int? year = null)
        {
            var id = await equipment.CreateAsync(new EquipmentInput(code, name + Tag, plate, null, Cat(cat), maker, model, year, Fuel(fuelType), own, mt, initial,
                "سجل تجريبي — يمكن حذفه", dep), ct);
            fleet.Add((id, mt, initial, perDay, project, Fuel(fuelType), litres));
        }

        await Add("DEMO-EQ01", "قلاب مرسيدس أكتروس", "ن ق ل 1201", "Trucks", "Diesel", OwnershipType.Owned, MeterType.Kilometers, 182_000, 180, p1, 180,
            Dep(3_400_000, 96, 900), "Mercedes-Benz", "Actros 3344", 2021);
        await Add("DEMO-EQ02", "قلاب فولفو FMX", "ن ق ل 1202", "Trucks", "Diesel", OwnershipType.Owned, MeterType.Kilometers, 95_000, 160, p2, 170,
            Dep(3_900_000, 96, 500), "Volvo", "FMX 440", 2023);
        await Add("DEMO-EQ03", "لودر كاتربيلر 950", "ل و د 330", "Loaders", "Diesel", OwnershipType.Owned, MeterType.EngineHours, 6_400, 8, p1, 160,
            Dep(5_200_000, 120, 1400), "Caterpillar", "950GC", 2020);
        await Add("DEMO-EQ04", "حفار كوماتسو PC300", "ح ف ر 410", "Excavators", "Diesel", OwnershipType.Owned, MeterType.EngineHours, 3_100, 9, p2, 220,
            Dep(7_800_000, 120, 700), "Komatsu", "PC300-8", 2022);
        await Add("DEMO-EQ05", "نصف نقل تويوتا هايلكس", "ط ي ب 7788", "Pickups", "Gasoline", OwnershipType.Owned, MeterType.Kilometers, 41_000, 120, p1, 60,
            Dep(1_650_000, 72, 300), "Toyota", "Hilux", 2024);
        await Add("DEMO-EQ06", "حفار هيونداي مؤجر", "ا ي ج 902", "Excavators", "Diesel", OwnershipType.Rented, MeterType.EngineHours, 8_800, 8, p2, 200, null,
            "Hyundai", "R340L", 2019);
        await Add("DEMO-EQ07", "قلاب مان مؤجر", "ا ي ج 903", "Trucks", "Diesel", OwnershipType.Rented, MeterType.Kilometers, 310_000, 150, p3, 170, null, "MAN", "TGS 40.400", 2018);

        decimal Meter((int Id, MeterType Type, decimal Initial, decimal PerDay, int Project, int FuelType, decimal Litres) e, int day) => e.Initial + e.PerDay * day;

        await rentals.CreateAsync(fleet[5].Id, new RentalContractInput("DEMO-R-01", "شركة النيل لتأجير المعدات" + Tag, "01000000001", Day(5), null,
            RentalRateType.Monthly, 85_000, false, false, true, null, null), ct);
        await rentals.CreateAsync(fleet[6].Id, new RentalContractInput("DEMO-R-02", "مؤسسة الدلتا للنقل" + Tag, "01000000002", Day(30), null,
            RentalRateType.Monthly, 42_000, true, false, true, null, null), ct);

        var assignDay = new[] { 1, 11, 2, 12, 3, 13, 31 };
        for (var i = 0; i < fleet.Count; i++)
            await assignments.AssignManyAsync(fleet[i].Project, new BulkAssignInput([fleet[i].Id], Day(assignDay[i]), "تخصيص تجريبي"), ct);
        await assignments.TransferAsync(fleet[2].Id, new TransferInput(p2, Day(95), Meter(fleet[2], 95), "نقل تجريبي بين المشروعات"), ct);

        var names = new[] { "محمود عبد الله", "أحمد سعيد", "خالد إبراهيم", "مصطفى حسن", "سيد عبد الرحمن" };
        var driverIds = new List<int>();
        for (var i = 0; i < names.Length; i++)
            driverIds.Add(await drivers.CreateAsync(new DriverInput(names[i] + Tag, $"2850101000{i:D4}", $"0101234{i:D4}", "القاهرة", EmploymentStatus.Active,
                Day(-400 - i * 30), $"DEMO-L-{1000 + i}", licenseType, i == 3 ? today.AddDays(12) : today.AddDays(200 + i * 90), null), ct));
        for (var i = 0; i < 5; i++)
            await assignments.AssignDriverAsync(new DriverAssignInput(driverIds[i], fleet[i].Id, Day(assignDay[i]), null, true, null), ct);
        await assignments.AssignDriverAsync(new DriverAssignInput(driverIds[4], fleet[6].Id, Day(31), null, false, "سائق احتياطي"), ct);

        var rnd = new Random(42);
        for (var i = 0; i < fleet.Count; i++)
        {
            var e = fleet[i];
            var price = e.FuelType == Fuel("Gasoline") ? 15.25m : 13.75m;
            for (var d = assignDay[i] + 2; d <= 148; d += 6 + rnd.Next(0, 3))
            {
                var litres = Math.Round(e.Litres * (decimal)(0.85 + rnd.NextDouble() * 0.3));
                var driver = i < 5 ? driverIds[i] : (int?)null;
                await fuel.CreateAsync(new FuelInput(e.Id, null, driver, e.FuelType, Day(d), litres, price, null, Meter(e, d), true,
                    rnd.Next(3) == 0 ? "محطة وطنية" : "محطة موبيل", null, null), ct);
            }
        }

        var oil = Maint("Engine Oil Change");
        foreach (var (idx, day) in new[] { (0, 40), (0, 120), (1, 60), (2, 50), (3, 70), (4, 90), (5, 80) })
        {
            var e = fleet[idx];
            var interval = e.Type == MeterType.Kilometers ? 5000 : 250;
            await maintenance.CreateAsync(new MaintenanceInput(e.Id, null, oil, Day(day), Meter(e, day), "تغيير زيت وفلاتر", "ورشة الأمل",
                2_400 + rnd.Next(0, 1200), 600, 150, 1, Day(day + 90), Meter(e, day) + interval, null, null), ct);
        }
        await maintenance.CreateAsync(new MaintenanceInput(fleet[3].Id, null, Maint("Hydraulic System Maintenance"), Day(110), Meter(fleet[3], 110),
            "تغيير خراطيم هيدروليك وطلمبة", "مركز كوماتسو المعتمد", 38_000, 6_500, 1_200, 4, null, null, null, null), ct);
        await maintenance.CreateAsync(new MaintenanceInput(fleet[0].Id, null, Maint("Tire Replacement"), Day(75), Meter(fleet[0], 75),
            "تغيير 4 إطارات خلفية", "الإطارات الحديثة", 52_000, 1_200, 0, 1, null, Meter(fleet[0], 75) + 60_000, null, null), ct);
        await maintenance.SavePlanAsync(null, new MaintenancePlanInput(fleet[1].Id, Maint("Air Filter Replacement"), 15000, null, 180, Day(20),
            Meter(fleet[1], 20), true, null), ct);

        var tolls = Exp("Road Tolls");
        for (var d = 5; d < 148; d += 9)
            await expenses.CreateAsync(new ExpenseInput(fleet[d % 2 == 0 ? 0 : 1].Id, null, tolls, Day(d), 150 + rnd.Next(0, 4) * 25, null, null, null,
                "كارتة الطريق الإقليمي", null, null), ct);
        await expenses.CreateAsync(new ExpenseInput(fleet[4].Id, null, Exp("Transportation"), Day(100), 1_800, null, null, null, "نقل عمالة للموقع", null, null), ct);
        await expenses.CreateAsync(new ExpenseInput(null, p1, Exp("Other Expenses"), Day(60), 4_500, null, null, null, "تصاريح عمل بالموقع", null, null), ct);

        await overtime.SaveRateAsync(null, new OvertimeRateInput(null, 45, Day(-30), null, "السعر الافتراضي التجريبي"), ct);
        await overtime.SaveRateAsync(null, new OvertimeRateInput(driverIds[2], 60, Day(-30), null, "سائق لودر"), ct);
        for (var d = 20; d < 148; d += 5)
        {
            var di = d / 5 % 5;
            var id = await overtime.CreateAsync(new OvertimeInput(driverIds[di], fleet[di].Id, null, Day(d), null, 1 + rnd.Next(0, 4), null, "تشغيل بعد المواعيد"), ct);
            if (d < 130) await overtime.SetApprovalAsync(id, rnd.Next(8) == 0 ? ApprovalStatus.Rejected : ApprovalStatus.Approved, ct);
        }

        await equipment.ChangeStatusAsync(fleet[3].Id, new StatusChangeInput(EquipmentStatus.UnderMaintenance, today.AddDays(-2), "عطل هيدروليك (تجريبي)"), ct);

        await sp.GetRequiredService<RentalAccrualService>().RunAllAsync(ct);
        log.LogWarning("Development sample data created (DEMO- records). Disable with Fleet:SampleData=false.");
    }
}
