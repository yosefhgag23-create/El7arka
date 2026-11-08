using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Fleet.Api.IntegrationTests;

[Collection("api")]
public class WorkflowTests(ApiFixture fx)
{
    private readonly HttpClient _c = fx.Client;
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.Now);
    private static string D(int daysAgo) => Today.AddDays(-daysAgo).ToString("yyyy-MM-dd");
    private static string U() => Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();

    private async Task<int> Lookup(string kind, string nameEn)
    {
        var items = await _c.Get($"/api/lookups/{kind}");
        return items.EnumerateArray().First(i => i.GetProperty("nameEn").GetString() == nameEn).GetProperty("id").GetInt32();
    }

    private async Task<int> CreateProject(string? name = null) => await _c.PostId("/api/projects", new
    {
        code = "P-" + U(), name = name ?? "مشروع اختبار", location = "القاهرة", startDate = D(400), status = "Active"
    });

    private async Task<int> CreateEquipment(string ownership = "Owned", object? depreciation = null, decimal initialMeter = 10_000) =>
        await _c.PostId("/api/equipment", new
        {
            code = "EQ-" + U(), name = "قلاب مرسيدس", plateNumber = "أ ب ج " + U(), categoryId = await Lookup("EquipmentCategories", "Trucks"),
            fuelTypeId = await Lookup("FuelTypes", "Diesel"), ownership, meterType = "Kilometers", initialMeterReading = initialMeter,
            depreciation
        });

    [Fact]
    public async Task Unauthenticated_requests_are_rejected()
    {
        var anon = fx.CreateAnonymousClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/projects")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anon.GetAsync("/api/health")).StatusCode);
    }

    [Fact]
    public async Task Transfer_closes_previous_assignment_and_keeps_full_history()
    {
        var p1 = await CreateProject("مشروع أ");
        var p2 = await CreateProject("مشروع ب");
        var eq = await CreateEquipment();

        await _c.PostOk($"/api/projects/{p1}/assign", new { equipmentIds = new[] { eq }, date = D(60) });
        await _c.PostOk($"/api/equipment/{eq}/transfer", new { toProjectId = p2, date = D(20), meterReading = 12_000, notes = "نقل" });

        var history = (await _c.Get($"/api/equipment/{eq}/assignments")).EnumerateArray().ToList();
        Assert.Equal(2, history.Count);
        var active = history.Single(h => h.GetProperty("endDate").ValueKind == JsonValueKind.Null);
        var closed = history.Single(h => h.GetProperty("endDate").ValueKind != JsonValueKind.Null);
        Assert.Equal(p2, active.GetProperty("projectId").GetInt32());
        Assert.Equal(D(21), closed.GetProperty("endDate").GetString());
        Assert.Equal(12_000m, closed.Dec("endMeter"));

        var details = await _c.Get($"/api/equipment/{eq}");
        Assert.Equal(p2, details.GetProperty("currentProjectId").GetInt32());
        Assert.Equal(12_000m, details.Dec("currentMeterReading"));
        Assert.Equal("Operating", details.GetProperty("status").GetString());

        await _c.PostExpectError($"/api/equipment/{eq}/transfer", new { toProjectId = p2, date = D(5) });
        await _c.PostExpectError($"/api/equipment/{eq}/transfer", new { toProjectId = p1, date = D(30) });

        var transfers = await _c.Get($"/api/assignments/transfers?equipmentId={eq}");
        Assert.Equal(2, transfers.GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Fuel_consumption_and_meter_validation()
    {
        var eq = await CreateEquipment(initialMeter: 10_000);
        await _c.PostId("/api/fuel", new { equipmentId = eq, fuelDate = D(10), quantity = 80, pricePerUnit = 15, meterReading = 10_000, isFullTank = true });
        await _c.PostId("/api/fuel", new { equipmentId = eq, fuelDate = D(5), quantity = 100, totalAmount = 1500, meterReading = 10_500, isFullTank = true });

        var consumption = await _c.Get($"/api/equipment/{eq}/fuel-consumption");
        Assert.Equal(5m, consumption.Dec("averageMeterPerUnit"));
        Assert.Equal(20m, consumption.Dec("averageUnitsPer100"));
        Assert.Equal(180m, consumption.Dec("totalFuel"));

        var err = await _c.PostExpectError("/api/fuel", new { equipmentId = eq, fuelDate = D(1), quantity = 50, pricePerUnit = 15, meterReading = 10_400, isFullTank = true });
        Assert.True(err.GetProperty("errors").TryGetProperty("meterReading", out _));

        var neg = await _c.PostExpectError("/api/fuel", new { equipmentId = eq, fuelDate = D(1), quantity = -5, pricePerUnit = 15 });
        Assert.True(neg.GetProperty("errors").TryGetProperty("quantity", out _));

        await _c.PostExpectError("/api/fuel", new { equipmentId = eq, fuelDate = D(1), quantity = 10, pricePerUnit = 15, totalAmount = 999 });
    }

    [Fact]
    public async Task Ledger_has_no_double_counting_and_reverses_on_delete()
    {
        var p = await CreateProject();
        var eq = await CreateEquipment();
        await _c.PostOk($"/api/projects/{p}/assign", new { equipmentIds = new[] { eq }, date = D(30) });

        var fuelId = await _c.PostId("/api/fuel", new { equipmentId = eq, fuelDate = D(10), quantity = 100, pricePerUnit = 15, meterReading = 10_200, isFullTank = true });
        await _c.PostId("/api/maintenance", new
        {
            equipmentId = eq, maintenanceTypeId = await Lookup("MaintenanceTypes", "Engine Oil Change"), maintenanceDate = D(8),
            meterReading = 10_300, partsCost = 800, laborCost = 300, otherCost = 100, nextDueMeter = 15_300
        });
        await _c.PostId("/api/expenses", new { equipmentId = eq, categoryId = await Lookup("ExpenseCategories", "Road Tolls"), expenseDate = D(7), amount = 50 });

        var totals = await _c.Get($"/api/costs/totals?projectId={p}");
        Assert.Equal(1500m, totals.Dec("fuel"));
        Assert.Equal(1200m, totals.Dec("maintenance"));
        Assert.Equal(800m, totals.Dec("spareParts"));
        Assert.Equal(50m, totals.Dec("other"));
        Assert.Equal(2750m, totals.Dec("totalCash"));

        var fuelCat = await Lookup("ExpenseCategories", "Diesel");
        await _c.PostExpectError("/api/expenses", new { equipmentId = eq, categoryId = fuelCat, expenseDate = D(7), amount = 100 });

        var del = await _c.DeleteAsync($"/api/fuel/{fuelId}?reason=خطأ");
        await HttpExtensions.EnsureOk(del);
        totals = await _c.Get($"/api/costs/totals?projectId={p}");
        Assert.Equal(0m, totals.Dec("fuel"));
        Assert.Equal(1250m, totals.Dec("totalCash"));

        var reminders = await _c.Get($"/api/equipment/{eq}/maintenance-reminders");
        Assert.Equal(15_300m, reminders[0].Dec("nextDueMeter"));
    }

    [Fact]
    public async Task Overtime_counts_only_when_approved()
    {
        var p = await CreateProject();
        var eq = await CreateEquipment();
        await _c.PostOk($"/api/projects/{p}/assign", new { equipmentIds = new[] { eq }, date = D(30) });
        var driver = await _c.PostId("/api/drivers", new { fullName = "محمد أحمد", phone = "01001234567", employmentStatus = "Active", hireDate = D(1000) });
        await _c.PostOk("/api/assignments/drivers", new { driverId = driver, equipmentId = eq, startDate = D(30), isPrimary = true });

        await _c.PostId("/api/overtime/rates", new { hourlyRate = 50, effectiveFrom = D(365) });
        var ot = await _c.PostId("/api/overtime", new { driverId = driver, equipmentId = eq, workDate = D(3), overtimeHours = 3 });
        var record = await _c.Get($"/api/overtime/{ot}");
        Assert.Equal(150m, record.Dec("amount"));
        Assert.Equal(p, record.GetProperty("projectId").GetInt32());

        Assert.Equal(0m, (await _c.Get($"/api/costs/totals?projectId={p}")).Dec("overtime"));
        await _c.PutOk($"/api/overtime/{ot}/approval", new { status = "Approved" });
        Assert.Equal(150m, (await _c.Get($"/api/costs/totals?projectId={p}")).Dec("overtime"));
        await _c.PutOk($"/api/overtime/{ot}/approval", new { status = "Rejected" });
        Assert.Equal(0m, (await _c.Get($"/api/costs/totals?projectId={p}")).Dec("overtime"));
    }

    [Fact]
    public async Task Rental_accrues_monthly_and_depreciation_stays_out_of_cash()
    {
        var p = await CreateProject();
        var rented = await CreateEquipment("Rented");
        await _c.PostOk($"/api/projects/{p}/assign", new { equipmentIds = new[] { rented }, date = D(100) });

        var monthStart = new DateOnly(Today.Year, Today.Month, 1).AddMonths(-2);
        var contractStart = monthStart.ToString("yyyy-MM-dd");
        await _c.PostId($"/api/equipment/{rented}/rental-contracts", new { lessor = "شركة التأجير", startDate = contractStart, rateType = "Monthly", rate = 30_000 });

        var expenses = await _c.Get($"/api/expenses?equipmentId={rented}&sourceType=Rental&pageSize=100");
        Assert.Equal(3, expenses.GetProperty("total").GetInt32());
        var fullMonths = expenses.GetProperty("items").EnumerateArray().Where(i => i.Dec("amount") == 30_000m).Count();
        Assert.Equal(2, fullMonths);

        var owned = await CreateEquipment("Owned", new
        {
            purchaseDate = "2024-01-01", purchasePrice = 1_200_000, residualValue = 120_000, usefulLifeMonths = 60,
            method = "StraightLine", depreciationStartDate = "2024-01-01"
        });
        var from = monthStart.ToString("yyyy-MM-dd");
        var to = Today.ToString("yyyy-MM-dd");
        var totals = await _c.Get($"/api/costs/totals?equipmentId={owned}&from={from}&to={to}");
        Assert.Equal(0m, totals.Dec("totalCash"));
        Assert.True(totals.Dec("depreciation") > 0);
        Assert.Equal(totals.Dec("depreciation"), totals.Dec("totalCostOfOwnership"));

        await _c.PostExpectError($"/api/equipment/{owned}/rental-contracts", new { lessor = "x", startDate = from, rateType = "Monthly", rate = 1 });
    }

    [Fact]
    public async Task Duplicate_identifiers_are_rejected()
    {
        var plate = "س ص ع " + U();
        var cat = await Lookup("EquipmentCategories", "Loaders");
        var fuel = await Lookup("FuelTypes", "Diesel");
        object Body(string code) => new { code, name = "لودر", plateNumber = plate, categoryId = cat, fuelTypeId = fuel, ownership = "Owned", meterType = "EngineHours", initialMeterReading = 0 };

        await _c.PostId("/api/equipment", Body("L-" + U()));
        var err = await _c.PostExpectError("/api/equipment", Body("L-" + U()));
        Assert.True(err.GetProperty("errors").TryGetProperty("plateNumber", out _));
    }

    [Fact]
    public async Task Project_with_active_equipment_cannot_be_archived()
    {
        var p = await CreateProject();
        var eq = await CreateEquipment();
        await _c.PostOk($"/api/projects/{p}/assign", new { equipmentIds = new[] { eq }, date = D(10) });
        var res = await _c.PutAsJsonAsync($"/api/projects/{p}/status", new { status = "Archived" }, ApiFixture.Json);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);

        await _c.PostOk($"/api/equipment/{eq}/transfer", new { toProjectId = (int?)null, date = D(2) });
        await _c.PutOk($"/api/projects/{p}/status", new { status = "Archived" });
        Assert.Equal("Available", (await _c.Get($"/api/equipment/{eq}")).GetProperty("status").GetString());
    }
}
