using Fleet.Application.Abstractions;
using Fleet.Domain.Calculations;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Common;

public class AssignmentLookup(IAppDbContext db)
{
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
