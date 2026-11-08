using Fleet.Application.Abstractions;
using Fleet.Application.Common;
using Fleet.Application.Depreciation;
using Fleet.Domain.Calculations;
using Fleet.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Costs;

public record CostFilter
{
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
    public int? ProjectId { get; init; }
    public int? EquipmentId { get; init; }
    public int? CategoryId { get; init; }
    public OwnershipType? Ownership { get; init; }
}

/// <summary>
/// Cash totals come only from the ledger. Spare parts is a category breakdown that overlaps maintenance and other manual purchases,
/// so it is never added to the other buckets. Depreciation is reported separately and never included in cash totals.
/// </summary>
public record CostTotals(decimal TotalCash, decimal Fuel, decimal Maintenance, decimal SpareParts, decimal Rental, decimal Overtime,
    decimal Other, decimal Depreciation)
{
    public decimal TotalCostOfOwnership => TotalCash + Depreciation;
}

public record CostBreakdownRow(int? Id, string Name, decimal TotalCash, decimal Fuel, decimal Maintenance, decimal Rental, decimal Overtime,
    decimal Other, decimal Depreciation)
{
    public decimal TotalCostOfOwnership => TotalCash + Depreciation;
}

public record CategoryTotal(int CategoryId, string CategoryName, ExpenseSystemKind Kind, decimal Amount, int Count);

public record MonthlyTotal(int Year, int Month, decimal TotalCash, decimal Fuel, decimal Maintenance, decimal Rental, decimal Overtime, decimal Other);

public class CostQueryService(IAppDbContext db, DepreciationService depreciation, IClock clock)
{
    internal sealed record Row(DateOnly Date, decimal Amount, int? ProjectId, int? EquipmentId, int CategoryId, ExpenseSourceType Source);

    private async Task<List<Row>> RowsAsync(CostFilter f, CancellationToken ct)
    {
        var q = db.Expenses.AsNoTracking()
            .WhereIf(f.From.HasValue, e => e.ExpenseDate >= f.From)
            .WhereIf(f.To.HasValue, e => e.ExpenseDate <= f.To)
            .WhereIf(f.ProjectId.HasValue, e => e.ProjectId == f.ProjectId)
            .WhereIf(f.EquipmentId.HasValue, e => e.EquipmentId == f.EquipmentId)
            .WhereIf(f.CategoryId.HasValue, e => e.CategoryId == f.CategoryId)
            .WhereIf(f.Ownership.HasValue, e => e.Equipment != null && e.Equipment.Ownership == f.Ownership);
        return await q.Select(e => new Row(e.ExpenseDate, e.Amount, e.ProjectId, e.EquipmentId, e.CategoryId, e.SourceType)).ToListAsync(ct);
    }

    private async Task<List<(int EquipmentId, int? ProjectId, decimal Amount)>> DepreciationRowsAsync(CostFilter f, CancellationToken ct)
    {
        if (f.CategoryId.HasValue || f.Ownership == OwnershipType.Rented) return [];
        var to = f.To ?? clock.Today;
        var from = f.From ?? await EarliestDepreciationStartAsync(ct) ?? to;
        IReadOnlyCollection<int>? ids = f.EquipmentId is { } e ? [e] : null;
        var rows = await depreciation.AllocatedAsync(from, to, ids, ct);
        return f.ProjectId is { } p ? rows.Where(r => r.ProjectId == p).ToList() : rows;
    }

    private Task<DateOnly?> EarliestDepreciationStartAsync(CancellationToken ct) =>
        db.DepreciationProfiles.Select(p => (DateOnly?)p.DepreciationStartDate).MinAsync(ct);

    private async Task<HashSet<int>> SparePartsCategoriesAsync(CancellationToken ct) =>
        (await db.ExpenseCategories.Where(c => c.SystemKind == ExpenseSystemKind.SpareParts).Select(c => c.Id).ToListAsync(ct)).ToHashSet();

    public async Task<CostTotals> TotalsAsync(CostFilter f, CancellationToken ct = default)
    {
        var rows = await RowsAsync(f, ct);
        var spare = await SparePartsCategoriesAsync(ct);
        var dep = (await DepreciationRowsAsync(f, ct)).Sum(r => r.Amount);
        return Totals(rows, spare, dep);
    }

    private static CostTotals Totals(IReadOnlyCollection<Row> rows, HashSet<int> spare, decimal dep)
    {
        decimal Sum(ExpenseSourceType s) => Money.Round(rows.Where(r => r.Source == s).Sum(r => r.Amount));
        var total = Money.Round(rows.Sum(r => r.Amount));
        var fuel = Sum(ExpenseSourceType.Fuel);
        var maint = Sum(ExpenseSourceType.Maintenance);
        var rental = Sum(ExpenseSourceType.Rental);
        var ot = Sum(ExpenseSourceType.Overtime);
        var parts = Money.Round(rows.Where(r => spare.Contains(r.CategoryId)).Sum(r => r.Amount));
        return new CostTotals(total, fuel, maint, parts, rental, ot, total - fuel - maint - rental - ot, Money.Round(dep));
    }

    public async Task<List<CostBreakdownRow>> ByProjectAsync(CostFilter f, CancellationToken ct = default)
    {
        var rows = await RowsAsync(f, ct);
        var dep = await DepreciationRowsAsync(f, ct);
        var names = await db.Projects.AsNoTracking().ToDictionaryAsync(p => p.Id, p => p.Name, ct);
        var keys = rows.Select(r => r.ProjectId).Concat(dep.Select(d => d.ProjectId)).Distinct();
        return keys.Select(k => Breakdown(k, k is { } id ? names.GetValueOrDefault(id, "?") : "بدون مشروع",
                rows.Where(r => r.ProjectId == k).ToList(), dep.Where(d => d.ProjectId == k).Sum(d => d.Amount)))
            .OrderByDescending(r => r.TotalCostOfOwnership).ToList();
    }

    public async Task<List<CostBreakdownRow>> ByEquipmentAsync(CostFilter f, CancellationToken ct = default)
    {
        var rows = await RowsAsync(f, ct);
        var dep = await DepreciationRowsAsync(f, ct);
        var names = await db.Equipment.AsNoTracking().ToDictionaryAsync(e => e.Id, e => $"{e.Code} - {e.Name}", ct);
        var keys = rows.Select(r => r.EquipmentId).Concat(dep.Select(d => (int?)d.EquipmentId)).Distinct();
        return keys.Select(k => Breakdown(k, k is { } id ? names.GetValueOrDefault(id, "?") : "مصروفات عامة للمشروع",
                rows.Where(r => r.EquipmentId == k).ToList(), dep.Where(d => d.EquipmentId == k).Sum(d => d.Amount)))
            .OrderByDescending(r => r.TotalCostOfOwnership).ToList();
    }

    private static CostBreakdownRow Breakdown(int? id, string name, List<Row> rows, decimal dep)
    {
        var t = Totals(rows, [], dep);
        return new CostBreakdownRow(id, name, t.TotalCash, t.Fuel, t.Maintenance, t.Rental, t.Overtime, t.Other, t.Depreciation);
    }

    public async Task<List<CategoryTotal>> ByCategoryAsync(CostFilter f, CancellationToken ct = default)
    {
        var rows = await RowsAsync(f, ct);
        var cats = await db.ExpenseCategories.AsNoTracking().ToDictionaryAsync(c => c.Id, ct);
        return rows.GroupBy(r => r.CategoryId)
            .Select(g => new CategoryTotal(g.Key, cats[g.Key].NameAr, cats[g.Key].SystemKind, Money.Round(g.Sum(r => r.Amount)), g.Count()))
            .OrderByDescending(c => c.Amount).ToList();
    }

    public async Task<List<MonthlyTotal>> ByMonthAsync(CostFilter f, CancellationToken ct = default)
    {
        var rows = await RowsAsync(f, ct);
        return rows.GroupBy(r => (r.Date.Year, r.Date.Month)).OrderBy(g => g.Key)
            .Select(g =>
            {
                var t = Totals(g.ToList(), [], 0);
                return new MonthlyTotal(g.Key.Year, g.Key.Month, t.TotalCash, t.Fuel, t.Maintenance, t.Rental, t.Overtime, t.Other);
            }).ToList();
    }
}
