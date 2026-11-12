using Fleet.Application.Abstractions;
using Fleet.Application.Assignments;
using Fleet.Application.Costs;
using Fleet.Application.Maintenance;
using Fleet.Application.Settings;
using Fleet.Domain.Calculations;
using Fleet.Domain.Common;
using Fleet.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Dashboard;

public record DashboardCounts(int TotalEquipment, int Owned, int Rented, int Available, int Operating, int UnderMaintenance, int OutOfService,
    int Inactive, int Unassigned, int ActiveProjects, int TotalProjects, int ActiveDrivers, int MaintenanceOverdue, int MaintenanceDueSoon,
    int LicensesExpiring, int EquipmentLicensesExpiring);

public record FuelMonth(int Year, int Month, decimal Quantity, decimal Amount);

public record UtilizationRow(int EquipmentId, string Code, string Name, decimal? UtilizationPercent, int OperatingDays, int DowntimeDays);

public record LicenseAlert(int DriverId, string FullName, string? Phone, DateOnly ExpiryDate, int DaysRemaining);

public record EquipmentLicenseAlert(int EquipmentId, string Code, string Name, string? LicenseNumber, DateOnly ExpiryDate, int DaysRemaining);

public record OwnershipCost(OwnershipType Ownership, decimal TotalCash, decimal Depreciation);

public record DashboardDto(DateOnly From, DateOnly To, DashboardCounts Counts, CostTotals Totals, List<MonthlyTotal> ByMonth,
    List<CategoryTotal> ByCategory, List<CostBreakdownRow> TopProjects, List<CostBreakdownRow> TopEquipment, List<FuelMonth> FuelByMonth,
    decimal? FleetUtilization, List<UtilizationRow> Utilization, List<OwnershipCost> ByOwnership, List<MaintenanceReminder> Maintenance,
    List<LicenseAlert> Licenses, List<TransferListItem> RecentTransfers, List<EquipmentLicenseAlert> EquipmentLicenses);

/// <summary>All dashboard figures come from the same services used by reports, so totals always match.</summary>
public class DashboardService(IAppDbContext db, IClock clock, CostQueryService costs, MaintenanceService maintenance,
    AssignmentService assignments, SettingsService settings)
{
    public async Task<DashboardDto> GetAsync(DateOnly? from, DateOnly? to, CancellationToken ct = default)
    {
        var today = clock.Today;
        var end = to ?? today;
        var start = from ?? new DateOnly(end.Year, end.Month, 1);
        if (start > end) throw new DomainException("تاريخ البداية يجب أن يسبق تاريخ النهاية", "from");

        var filter = new CostFilter { From = start, To = end };
        var cfg = await settings.GetEntityAsync(ct);

        var equipment = await db.Equipment.AsNoTracking()
            .Select(e => new { e.Id, e.Code, e.Name, e.Ownership, e.Status, e.IsActive, Assigned = e.ProjectAssignments.Any(a => a.EndDate == null) })
            .ToListAsync(ct);
        var active = equipment.Where(e => e.IsActive).ToList();

        var reminders = await maintenance.RemindersAsync(null, dueOnly: true, ct);
        var licenseLimit = today.AddDays(cfg.LicenseExpiryWarningDays);
        var licenses = (await db.Drivers.AsNoTracking()
                .Where(d => d.IsActive && d.LicenseExpiryDate != null && d.LicenseExpiryDate <= licenseLimit)
                .OrderBy(d => d.LicenseExpiryDate)
                .Select(d => new { d.Id, d.FullName, d.Phone, d.LicenseExpiryDate })
                .ToListAsync(ct))
            .Select(d => new LicenseAlert(d.Id, d.FullName, d.Phone, d.LicenseExpiryDate!.Value, d.LicenseExpiryDate.Value.DayNumber - today.DayNumber))
            .ToList();
        var equipmentLicenses = (await db.Equipment.AsNoTracking()
                .Where(e => e.IsActive && e.LicenseExpiryDate != null && e.LicenseExpiryDate <= licenseLimit)
                .OrderBy(e => e.LicenseExpiryDate)
                .Select(e => new { e.Id, e.Code, e.Name, e.LicenseNumber, e.LicenseExpiryDate })
                .ToListAsync(ct))
            .Select(e => new EquipmentLicenseAlert(e.Id, e.Code, e.Name, e.LicenseNumber, e.LicenseExpiryDate!.Value,
                e.LicenseExpiryDate.Value.DayNumber - today.DayNumber))
            .ToList();

        var counts = new DashboardCounts(
            active.Count,
            active.Count(e => e.Ownership == OwnershipType.Owned),
            active.Count(e => e.Ownership == OwnershipType.Rented),
            active.Count(e => e.Status == EquipmentStatus.Available),
            active.Count(e => e.Status == EquipmentStatus.Operating),
            active.Count(e => e.Status == EquipmentStatus.UnderMaintenance),
            active.Count(e => e.Status == EquipmentStatus.OutOfService),
            equipment.Count(e => !e.IsActive || e.Status == EquipmentStatus.Inactive),
            active.Count(e => !e.Assigned && e.Status != EquipmentStatus.Inactive),
            await db.Projects.CountAsync(p => p.Status == ProjectStatus.Active, ct),
            await db.Projects.CountAsync(p => p.Status != ProjectStatus.Archived, ct),
            await db.Drivers.CountAsync(d => d.IsActive && d.EmploymentStatus == EmploymentStatus.Active, ct),
            reminders.Count(r => r.Status == MaintenanceDueStatus.Overdue),
            reminders.Count(r => r.Status == MaintenanceDueStatus.DueSoon),
            licenses.Count,
            equipmentLicenses.Count);

        var fuel = (await db.FuelTransactions.AsNoTracking()
                .Where(f => f.FuelDate >= start && f.FuelDate <= end)
                .Select(f => new { f.FuelDate, f.Quantity, f.TotalAmount })
                .ToListAsync(ct))
            .GroupBy(f => (f.FuelDate.Year, f.FuelDate.Month)).OrderBy(g => g.Key)
            .Select(g => new FuelMonth(g.Key.Year, g.Key.Month, Money.Round(g.Sum(x => x.Quantity)), Money.Round(g.Sum(x => x.TotalAmount))))
            .ToList();

        var (fleetUtil, util) = await UtilizationAsync(active.Select(e => (e.Id, e.Code, e.Name)).ToList(), start, Min(end, today), ct);

        var owned = await costs.TotalsAsync(filter with { Ownership = OwnershipType.Owned }, ct);
        var rented = await costs.TotalsAsync(filter with { Ownership = OwnershipType.Rented }, ct);

        return new DashboardDto(
            start, end, counts,
            await costs.TotalsAsync(filter, ct),
            await costs.ByMonthAsync(filter, ct),
            await costs.ByCategoryAsync(filter, ct),
            (await costs.ByProjectAsync(filter, ct)).Take(10).ToList(),
            (await costs.ByEquipmentAsync(filter, ct)).Where(r => r.Id != null).Take(10).ToList(),
            fuel, fleetUtil, util,
            [new OwnershipCost(OwnershipType.Owned, owned.TotalCash, owned.Depreciation), new OwnershipCost(OwnershipType.Rented, rented.TotalCash, 0)],
            reminders.OrderBy(r => r.Status == MaintenanceDueStatus.Overdue ? 0 : 1).ThenBy(r => r.DaysRemaining ?? int.MaxValue).Take(10).ToList(),
            licenses.Take(10).ToList(),
            (await assignments.TransfersAsync(new TransferQuery { PageSize = 6 }, ct)).Items.ToList(),
            equipmentLicenses.Take(10).ToList());
    }

    private static DateOnly Min(DateOnly a, DateOnly b) => a < b ? a : b;

    private async Task<(decimal?, List<UtilizationRow>)> UtilizationAsync(List<(int Id, string Code, string Name)> equipment, DateOnly from, DateOnly to,
        CancellationToken ct)
    {
        if (to < from || equipment.Count == 0) return (null, []);
        var ids = equipment.Select(e => e.Id).ToList();
        var spans = (await db.EquipmentStatusHistory.AsNoTracking()
                .Where(h => ids.Contains(h.EquipmentId) && h.FromDate <= to && (h.ToDate == null || h.ToDate >= from))
                .Select(h => new { h.EquipmentId, h.Status, h.FromDate, h.ToDate })
                .ToListAsync(ct))
            .ToLookup(h => h.EquipmentId);

        var rows = new List<UtilizationRow>();
        int operating = 0, baseDays = 0;
        foreach (var e in equipment)
        {
            var history = spans[e.Id].Select(h => new StatusSpan(h.Status, h.FromDate, h.ToDate)).ToList();
            if (history.Count == 0) continue;
            var r = UtilizationCalculator.Calculate(history, from, to);
            operating += r.Days(EquipmentStatus.Operating);
            baseDays += r.AvailableBase;
            rows.Add(new UtilizationRow(e.Id, e.Code, e.Name, r.UtilizationPercent, r.Days(EquipmentStatus.Operating), r.DowntimeDays));
        }
        decimal? fleet = baseDays > 0 ? Math.Round(100m * operating / baseDays, 1) : null;
        return (fleet, rows.OrderByDescending(r => r.UtilizationPercent ?? -1).Take(12).ToList());
    }
}
