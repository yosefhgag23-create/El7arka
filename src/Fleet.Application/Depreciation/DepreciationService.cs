using Fleet.Application.Abstractions;
using Fleet.Application.Common;
using Fleet.Domain.Calculations;
using Fleet.Domain.Common;
using Fleet.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Depreciation;

public record DepreciationQuery
{
    public DateOnly? AsOf { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
    public int? CategoryId { get; init; }
    public int? ProjectId { get; init; }
    public string? Search { get; init; }
}

public record DepreciationItem(int EquipmentId, string EquipmentCode, string EquipmentName, string CategoryName, DateOnly PurchaseDate,
    decimal PurchasePrice, decimal ResidualValue, int UsefulLifeMonths, DateOnly StartDate, DateOnly EndDate, DateOnly? DisposalDate,
    decimal MonthlyDepreciation, decimal AnnualDepreciation, decimal PeriodDepreciation, decimal AccumulatedDepreciation, decimal BookValue,
    bool FullyDepreciated);

public record DepreciationSummary(DateOnly AsOf, DateOnly? From, DateOnly? To, decimal TotalPurchasePrice, decimal TotalAccumulated,
    decimal TotalBookValue, decimal TotalPeriodDepreciation, decimal TotalMonthly, List<DepreciationItem> Items);

public record ProjectDepreciation(int? ProjectId, decimal Amount);

/// <summary>Depreciation is computed on demand and never stored in the cash expense ledger.</summary>
public class DepreciationService(IAppDbContext db, IClock clock, AssignmentLookup assignments)
{
    public async Task<DepreciationSummary> ListAsync(DepreciationQuery q, CancellationToken ct = default)
    {
        var asOf = q.AsOf ?? q.To ?? clock.Today;
        var search = Text.Clean(q.Search);
        var profiles = await db.DepreciationProfiles.AsNoTracking()
            .Where(p => p.Equipment!.Ownership == OwnershipType.Owned)
            .WhereIf(q.CategoryId.HasValue, p => p.Equipment!.CategoryId == q.CategoryId)
            .WhereIf(q.ProjectId.HasValue, p => p.Equipment!.ProjectAssignments.Any(a => a.ProjectId == q.ProjectId))
            .WhereIf(search != null, p => p.Equipment!.Name.Contains(search!) || p.Equipment.Code.Contains(search!))
            .Select(p => new { p, p.Equipment!.Code, p.Equipment.Name, Cat = p.Equipment.Category!.NameAr })
            .ToListAsync(ct);

        var items = profiles.Select(x =>
        {
            var input = ToInput(x.p);
            var period = q.From is { } f && q.To is { } t ? DepreciationCalculator.ForPeriod(input, f, t) : 0;
            var acc = DepreciationCalculator.AccumulatedAsOf(input, asOf);
            return new DepreciationItem(x.p.EquipmentId, x.Code, x.Name, x.Cat, x.p.PurchaseDate, x.p.PurchasePrice, x.p.ResidualValue,
                x.p.UsefulLifeMonths, x.p.DepreciationStartDate, DepreciationCalculator.WindowEnd(input), x.p.DisposalDate,
                DepreciationCalculator.MonthlyNominal(input), DepreciationCalculator.AnnualNominal(input), period, acc, x.p.PurchasePrice - acc,
                DepreciationCalculator.IsFullyDepreciated(input, asOf));
        }).OrderBy(i => i.EquipmentCode).ToList();

        return new DepreciationSummary(asOf, q.From, q.To, items.Sum(i => i.PurchasePrice), items.Sum(i => i.AccumulatedDepreciation),
            items.Sum(i => i.BookValue), items.Sum(i => i.PeriodDepreciation), items.Where(i => !i.FullyDepreciated).Sum(i => i.MonthlyDepreciation), items);
    }

    public async Task<List<DepreciationScheduleRow>> ScheduleAsync(int equipmentId, CancellationToken ct = default)
    {
        var p = await db.DepreciationProfiles.AsNoTracking().FirstOrDefaultAsync(x => x.EquipmentId == equipmentId, ct)
            ?? throw new DomainException("لا توجد بيانات إهلاك لهذه المعدة");
        var input = ToInput(p);
        var end = p.DisposalDate is { } d && d < DepreciationCalculator.WindowEnd(input) ? d : DepreciationCalculator.WindowEnd(input);
        return DepreciationCalculator.MonthlySchedule(input, p.DepreciationStartDate, end).ToList();
    }

    /// <summary>Depreciation in a period per equipment and per project, prorated by the exact days assigned to each project.</summary>
    public async Task<List<(int EquipmentId, int? ProjectId, decimal Amount)>> AllocatedAsync(DateOnly from, DateOnly to,
        IReadOnlyCollection<int>? equipmentIds = null, CancellationToken ct = default)
    {
        var query = db.DepreciationProfiles.AsNoTracking().Where(p => p.Equipment!.Ownership == OwnershipType.Owned);
        if (equipmentIds is not null) query = query.Where(p => equipmentIds.Contains(p.EquipmentId));
        var profiles = await query.ToListAsync(ct);
        var spans = await assignments.SpansByEquipmentAsync(profiles.Select(p => p.EquipmentId), ct);

        var result = new List<(int, int?, decimal)>();
        foreach (var p in profiles)
        {
            var input = ToInput(p);
            foreach (var slice in CostAllocationCalculator.SplitByProject(from, to, spans.GetValueOrDefault(p.EquipmentId) ?? []))
            {
                var amount = DepreciationCalculator.ForPeriod(input, slice.Start, slice.End);
                if (amount > 0) result.Add((p.EquipmentId, slice.ProjectId, amount));
            }
        }
        return result;
    }

    private static DepreciationInput ToInput(Domain.Entities.DepreciationProfile p) =>
        new(p.PurchasePrice, p.ResidualValue, p.UsefulLifeMonths, p.DepreciationStartDate, p.DisposalDate);
}
