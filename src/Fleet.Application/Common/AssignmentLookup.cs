using Fleet.Application.Abstractions;
using Fleet.Domain.Calculations;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Common;

/// <summary>Values a data-entry form can pre-fill for an equipment on a date; every field is optional.</summary>
public record EntryDefaults(int? ProjectId, string? ProjectName, int? DriverId, string? DriverName, decimal? LastFuelPrice);

public class AssignmentLookup(IAppDbContext db)
{
    /// <summary>Project and driver on the date, plus the latest fuel price (same fuel type) on or before it.</summary>
    public async Task<EntryDefaults> EntryDefaultsAsync(int equipmentId, DateOnly date, CancellationToken ct = default)
    {
        var project = await db.ProjectAssignments
            .Where(a => a.EquipmentId == equipmentId && a.StartDate <= date && (a.EndDate == null || a.EndDate >= date))
            .Select(a => new { a.ProjectId, a.Project!.Name })
            .FirstOrDefaultAsync(ct);
        var driver = await db.DriverAssignments
            .Where(a => a.EquipmentId == equipmentId && a.StartDate <= date && (a.EndDate == null || a.EndDate >= date))
            .OrderByDescending(a => a.IsPrimary).ThenByDescending(a => a.StartDate)
            .Select(a => new { a.DriverId, a.Driver!.FullName })
            .FirstOrDefaultAsync(ct);
        var fuelTypeId = await db.Equipment.Where(e => e.Id == equipmentId).Select(e => (int?)e.FuelTypeId).FirstOrDefaultAsync(ct);
        var price = await db.FuelTransactions
            .Where(f => f.FuelTypeId == fuelTypeId && f.FuelDate <= date && f.PricePerUnit > 0)
            .OrderByDescending(f => f.FuelDate).ThenByDescending(f => f.Id)
            .Select(f => (decimal?)f.PricePerUnit)
            .FirstOrDefaultAsync(ct);
        return new EntryDefaults(project?.ProjectId, project?.Name, driver?.DriverId, driver?.FullName, price);
    }

    /// <summary>Project the equipment was assigned to on the given date.</summary>
    public Task<int?> ProjectOnDateAsync(int equipmentId, DateOnly date, CancellationToken ct = default) =>
        db.ProjectAssignments
            .Where(a => a.EquipmentId == equipmentId && a.StartDate <= date && (a.EndDate == null || a.EndDate >= date))
            .Select(a => (int?)a.ProjectId)
            .FirstOrDefaultAsync(ct);

    public async Task<Dictionary<int, List<AssignmentSpan>>> SpansByEquipmentAsync(IEnumerable<int>? equipmentIds = null, CancellationToken ct = default)
    {
        var q = db.ProjectAssignments.AsQueryable();
        if (equipmentIds is not null)
        {
            var ids = equipmentIds.ToList();
            q = q.Where(a => ids.Contains(a.EquipmentId));
        }
        var rows = await q.Select(a => new { a.EquipmentId, a.ProjectId, a.StartDate, a.EndDate }).ToListAsync(ct);
        return rows.GroupBy(r => r.EquipmentId)
            .ToDictionary(g => g.Key, g => g.Select(r => new AssignmentSpan(r.ProjectId, r.StartDate, r.EndDate)).ToList());
    }
}
