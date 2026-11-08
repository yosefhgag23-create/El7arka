using System.Text.Json;

namespace Fleet.Api.IntegrationTests;

[Collection("api")]
public class ReportTests(ApiFixture fx)
{
    private readonly HttpClient _c = fx.Client;
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.Now);
    private static string D(int daysAgo) => Today.AddDays(-daysAgo).ToString("yyyy-MM-dd");
    private static string U() => Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();

    private async Task<int> Lookup(string kind, string nameEn) =>
        (await _c.Get($"/api/lookups/{kind}")).EnumerateArray().First(i => i.GetProperty("nameEn").GetString() == nameEn).GetProperty("id").GetInt32();

    private async Task SeedAsync()
    {
        var p = await _c.PostId("/api/projects", new { code = "RP-" + U(), name = "مشروع التقارير", startDate = D(200), status = "Active" });
        var eq = await _c.PostId("/api/equipment", new
        {
            code = "REQ-" + U(), name = "لودر", plateNumber = "ر ق م " + U(), categoryId = await Lookup("EquipmentCategories", "Trucks"), fuelTypeId = await Lookup("FuelTypes", "Diesel"),
            ownership = "Owned", meterType = "Kilometers", initialMeterReading = 5_000,
            depreciation = new { purchaseDate = D(365), purchasePrice = 1_200_000, residualValue = 200_000, usefulLifeMonths = 120, method = "StraightLine", depreciationStartDate = D(365) }
        });
        await _c.PostOk($"/api/projects/{p}/assign", new { equipmentIds = new[] { eq }, date = D(90) });
        await _c.PostId("/api/fuel", new { equipmentId = eq, fuelDate = D(20), quantity = 120, pricePerUnit = 15, meterReading = 5_400, isFullTank = true });
        await _c.PostId("/api/fuel", new { equipmentId = eq, fuelDate = D(10), quantity = 90, pricePerUnit = 15, meterReading = 5_900, isFullTank = true });
        await _c.PostId("/api/maintenance", new
        {
            equipmentId = eq, maintenanceTypeId = await Lookup("MaintenanceTypes", "Engine Oil Change"), maintenanceDate = D(8),
            meterReading = 6_000, partsCost = 600, laborCost = 250, nextDueMeter = 11_000
        });
        await _c.PostId("/api/expenses", new { equipmentId = eq, categoryId = await Lookup("ExpenseCategories", "Road Tolls"), expenseDate = D(7), amount = 75 });
    }

    [Fact]
    public async Task Every_report_builds_and_exports_to_pdf_and_excel()
    {
        await SeedAsync();
        var catalog = (await _c.Get("/api/reports")).EnumerateArray().ToList();
        Assert.True(catalog.Count >= 18);
        var query = $"from={D(120)}&to={D(0)}&asOf={D(0)}";

        foreach (var key in catalog.Select(r => r.GetProperty("key").GetString()!))
        {
            var doc = await _c.Get($"/api/reports/{key}?{query}");
            Assert.Equal(key, doc.GetProperty("key").GetString());
            Assert.True(doc.GetProperty("tables").GetArrayLength() > 0, key);

            var pdf = await _c.GetAsync($"/api/reports/{key}/pdf?{query}");
            await HttpExtensions.EnsureOk(pdf);
            Assert.Equal("application/pdf", pdf.Content.Headers.ContentType?.MediaType);
            var pdfBytes = await pdf.Content.ReadAsByteArrayAsync();
            Assert.True(pdfBytes.Length > 1000 && pdfBytes[0] == '%' && pdfBytes[1] == 'P', key);

            var xlsx = await _c.GetAsync($"/api/reports/{key}/xlsx?{query}");
            await HttpExtensions.EnsureOk(xlsx);
            var xlsxBytes = await xlsx.Content.ReadAsByteArrayAsync();
            Assert.True(xlsxBytes.Length > 1000 && xlsxBytes[0] == 'P' && xlsxBytes[1] == 'K', key);
        }
    }

    [Fact]
    public async Task Report_totals_match_dashboard()
    {
        await SeedAsync();
        var query = $"from={D(120)}&to={D(0)}";
        var dashboard = await _c.Get($"/api/dashboard?{query}");
        var totals = dashboard.GetProperty("totals");

        var byProject = await _c.Get($"/api/reports/cost-by-project?{query}");
        Assert.Equal(totals.Dec("totalCash"), SummaryValue(byProject, 0));
        Assert.Equal(totals.Dec("depreciation"), SummaryValue(byProject, 1));

        var fuel = await _c.Get($"/api/reports/fuel?{query}");
        Assert.Equal(totals.Dec("fuel"), SummaryValue(fuel, 1));

        var expenses = await _c.Get($"/api/reports/operating-expenses?{query}");
        Assert.Equal(totals.Dec("totalCash"), SummaryValue(expenses, 0));
    }

    [Fact]
    public async Task Unknown_report_returns_404()
    {
        var res = await _c.GetAsync("/api/reports/does-not-exist");
        Assert.Equal(System.Net.HttpStatusCode.NotFound, res.StatusCode);
    }

    private static decimal SummaryValue(JsonElement doc, int index) => doc.GetProperty("summary")[index].GetProperty("value").GetDecimal();
}
