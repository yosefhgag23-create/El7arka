using System.Linq.Expressions;
using Fleet.Application.Abstractions;
using Fleet.Application.Common;
using Fleet.Application.Settings;
using Fleet.Domain.Calculations;
using Fleet.Domain.Common;
using Fleet.Domain.Entities;
using Fleet.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Fuel;

public record FuelQuery : PageQuery
{
    public int? EquipmentId { get; init; }
    public int? ProjectId { get; init; }
    public int? DriverId { get; init; }
    public int? FuelTypeId { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
}

public record FuelListItem(int Id, DateOnly FuelDate, int EquipmentId, string EquipmentCode, string EquipmentName, int? ProjectId, string? ProjectName,
    int? DriverId, string? DriverName, int FuelTypeId, string FuelTypeName, string Unit, decimal Quantity, decimal PricePerUnit, decimal TotalAmount,
    decimal? MeterReading, bool IsFullTank, string? Station, int? AttachmentId, string? Notes);

public record FuelInput(int EquipmentId, int? ProjectId, int? DriverId, int? FuelTypeId, DateOnly FuelDate, decimal Quantity,
    decimal? PricePerUnit, decimal? TotalAmount, decimal? MeterReading, bool IsFullTank, string? Station, int? AttachmentId, string? Notes);

public record FuelSegmentDto(int FillId, DateOnly Date, decimal? StartMeter, decimal? EndMeter, decimal Distance, decimal Fuel,
    FuelSegmentStatus Status, decimal? MeterPerUnit, decimal? UnitsPer100, decimal? UnitsPerMeter, bool IsAnomaly);

public record FuelConsumptionDto(int EquipmentId, string EquipmentName, MeterType MeterType, string Unit, decimal TotalFuel, decimal TotalAmount,
    decimal ValidDistance, decimal ValidFuel, int ValidSegments, decimal? AverageMeterPerUnit, decimal? AverageUnitsPer100,
    decimal? AverageUnitsPerMeter, int AnomalyCount, List<FuelSegmentDto> Segments);

public class FuelInputValidator : AbstractValidator<FuelInput>
{
    public FuelInputValidator()
    {
        RuleFor(x => x.EquipmentId).GreaterThan(0).WithMessage("المعدة مطلوبة");
        RuleFor(x => x.Quantity).GreaterThan(0).WithMessage("كمية الوقود يجب أن تكون أكبر من صفر").LessThan(100_000).WithMessage("كمية غير منطقية");
        RuleFor(x => x).Must(x => x.PricePerUnit.HasValue || x.TotalAmount.HasValue).WithName("totalAmount").WithMessage("أدخل سعر اللتر أو الإجمالي");
        RuleFor(x => x.PricePerUnit).GreaterThanOrEqualTo(0).When(x => x.PricePerUnit.HasValue).WithMessage("السعر لا يمكن أن يكون سالباً");
        RuleFor(x => x.TotalAmount).GreaterThanOrEqualTo(0).When(x => x.TotalAmount.HasValue).WithMessage("الإجمالي لا يمكن أن يكون سالباً");
        RuleFor(x => x.MeterReading).GreaterThanOrEqualTo(0).When(x => x.MeterReading.HasValue).WithMessage("قراءة العداد لا يمكن أن تكون سالبة");
        RuleFor(x => x.Station).OptionalText(200);
        RuleFor(x => x.Notes).OptionalText(2000);
    }
}

public class FuelService(IAppDbContext db, IValidator<FuelInput> validator, IClock clock, MeterReadingService meters, LedgerService ledger,
    AssignmentLookup assignments, SettingsService settings)
{
    private static readonly Dictionary<string, Expression<Func<FuelTransaction, object?>>> Sorts = new(StringComparer.OrdinalIgnoreCase)
    {
        ["fuelDate"] = f => f.FuelDate,
        ["quantity"] = f => f.Quantity,
        ["totalAmount"] = f => f.TotalAmount,
        ["meterReading"] = f => f.MeterReading,
        ["equipment"] = f => f.Equipment!.Code,
    };

    public static IQueryable<FuelTransaction> Filter(IQueryable<FuelTransaction> q, FuelQuery f)
    {
        var search = Text.Clean(f.Search);
        return q.WhereIf(f.EquipmentId.HasValue, x => x.EquipmentId == f.EquipmentId)
            .WhereIf(f.ProjectId.HasValue, x => x.ProjectId == f.ProjectId)
            .WhereIf(f.DriverId.HasValue, x => x.DriverId == f.DriverId)
            .WhereIf(f.FuelTypeId.HasValue, x => x.FuelTypeId == f.FuelTypeId)
            .WhereIf(f.From.HasValue, x => x.FuelDate >= f.From)
            .WhereIf(f.To.HasValue, x => x.FuelDate <= f.To)
            .WhereIf(search != null, x => x.Equipment!.Name.Contains(search!) || x.Equipment.Code.Contains(search!)
                || (x.Station != null && x.Station.Contains(search!)) || (x.Notes != null && x.Notes.Contains(search!)));
    }

    public static readonly Expression<Func<FuelTransaction, FuelListItem>> ToItem = f => new FuelListItem(f.Id, f.FuelDate, f.EquipmentId,
        f.Equipment!.Code, f.Equipment.Name, f.ProjectId, f.Project!.Name, f.DriverId, f.Driver!.FullName, f.FuelTypeId, f.FuelType!.NameAr,
        f.FuelType.Unit, f.Quantity, f.PricePerUnit, f.TotalAmount, f.MeterReading, f.IsFullTank, f.Station, f.AttachmentId, f.Notes);

    public Task<PagedResult<FuelListItem>> ListAsync(FuelQuery q, CancellationToken ct = default) =>
        Filter(db.FuelTransactions.AsNoTracking(), q).ApplySort(q, Sorts, f => f.FuelDate, defaultDesc: true).ToPagedAsync(q, ToItem, ct);

    public async Task<FuelListItem> GetAsync(int id, CancellationToken ct = default) =>
        await db.FuelTransactions.AsNoTracking().Where(f => f.Id == id).Select(ToItem).FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("عملية التموين", id);

    public async Task<int> CreateAsync(FuelInput input, CancellationToken ct = default)
    {
        await validator.EnsureValidAsync(input, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var f = new FuelTransaction();
        await ApplyAsync(f, input, ct);
        db.FuelTransactions.Add(f);
        await db.SaveChangesAsync(ct);
        await meters.RecordAsync(f.EquipmentId, f.FuelDate, f.MeterReading, MeterReadingSource.Fuel, f.Id, ct);
        await ledger.SyncFuelAsync(f, ct);
        await db.SaveChangesAsync(ct);
        await meters.RefreshCurrentAsync(f.EquipmentId, ct);
        await tx.CommitAsync(ct);
        return f.Id;
    }

    public async Task UpdateAsync(int id, FuelInput input, CancellationToken ct = default)
    {
        await validator.EnsureValidAsync(input, ct);
        var f = await db.FuelTransactions.FindAsync([id], ct) ?? throw new NotFoundException("عملية التموين", id);
        var oldEquipment = f.EquipmentId;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await ApplyAsync(f, input, ct);
        await meters.RecordAsync(f.EquipmentId, f.FuelDate, f.MeterReading, MeterReadingSource.Fuel, f.Id, ct);
        await ledger.SyncFuelAsync(f, ct);
        await db.SaveChangesAsync(ct);
        await meters.RefreshCurrentAsync(f.EquipmentId, ct);
        if (oldEquipment != f.EquipmentId) await meters.RefreshCurrentAsync(oldEquipment, ct);
        await tx.CommitAsync(ct);
    }

    public async Task DeleteAsync(int id, string? reason, CancellationToken ct = default)
    {
        var f = await db.FuelTransactions.FindAsync([id], ct) ?? throw new NotFoundException("عملية التموين", id);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        f.IsDeleted = true;
        f.DeletedAt = clock.UtcNow;
        f.DeleteReason = Text.Clean(reason);
        await meters.RemoveForSourceAsync(MeterReadingSource.Fuel, id, ct);
        await ledger.SyncFuelAsync(f, ct);
        await db.SaveChangesAsync(ct);
        await meters.RefreshCurrentAsync(f.EquipmentId, ct);
        await tx.CommitAsync(ct);
    }

    private async Task ApplyAsync(FuelTransaction f, FuelInput i, CancellationToken ct)
    {
        var e = await db.Equipment.FindAsync([i.EquipmentId], ct) ?? throw new DomainException("المعدة غير موجودة", "equipmentId");
        if (i.FuelDate > clock.Today) throw new DomainException("لا يمكن تسجيل تموين بتاريخ مستقبلي", "fuelDate");
        var fuelTypeId = i.FuelTypeId ?? e.FuelTypeId;
        if (!await db.FuelTypes.AnyAsync(t => t.Id == fuelTypeId, ct)) throw new DomainException("نوع الوقود غير موجود", "fuelTypeId");
        if (i.DriverId is { } d && !await db.Drivers.AnyAsync(x => x.Id == d, ct)) throw new DomainException("السائق غير موجود", "driverId");
        var projectId = i.ProjectId ?? await assignments.ProjectOnDateAsync(e.Id, i.FuelDate, ct);
        if (projectId is { } p && !await db.Projects.AnyAsync(x => x.Id == p, ct)) throw new DomainException("المشروع غير موجود", "projectId");

        var (price, total) = ResolveAmounts(i.Quantity, i.PricePerUnit, i.TotalAmount);

        f.EquipmentId = e.Id;
        f.ProjectId = projectId;
        f.DriverId = i.DriverId;
        f.FuelTypeId = fuelTypeId;
        f.FuelDate = i.FuelDate;
        f.Quantity = i.Quantity;
        f.PricePerUnit = price;
        f.TotalAmount = total;
        f.MeterReading = i.MeterReading;
        f.IsFullTank = i.IsFullTank;
        f.Station = Text.Clean(i.Station);
        f.AttachmentId = i.AttachmentId;
        f.Notes = Text.Clean(i.Notes);
    }

    /// <summary>User enters any two of quantity/price/total; the third is derived and consistency is enforced.</summary>
    public static (decimal Price, decimal Total) ResolveAmounts(decimal quantity, decimal? price, decimal? total)
    {
        if (price is not null && total is not null)
        {
            if (Math.Abs(Money.Round(quantity * price.Value) - total.Value) > Math.Max(0.05m, total.Value * 0.001m))
                throw new DomainException($"الإجمالي ({total:N2}) لا يساوي الكمية × السعر ({quantity * price:N2})", "totalAmount");
            return (price.Value, Money.Round(total.Value));
        }
        if (price is not null) return (price.Value, Money.Round(quantity * price.Value));
        return (Math.Round(total!.Value / quantity, 4), Money.Round(total.Value));
    }

    // ---------------- Consumption ----------------

    public async Task<FuelConsumptionDto> ConsumptionAsync(int equipmentId, DateOnly? from, DateOnly? to, CancellationToken ct = default)
    {
        var e = await db.Equipment.Include(x => x.FuelType).AsNoTracking().FirstOrDefaultAsync(x => x.Id == equipmentId, ct)
            ?? throw new NotFoundException("المعدة", equipmentId);
        var threshold = (await settings.GetEntityAsync(ct)).FuelAnomalyThresholdPercent;
        var all = await LoadConsumptionAsync([equipmentId], threshold, ct);
        return Scope(all.GetValueOrDefault(equipmentId), e, from, to);
    }

    /// <summary>Per-equipment consumption for the fuel consumption report.</summary>
    public async Task<List<FuelConsumptionDto>> ConsumptionReportAsync(FuelQuery q, CancellationToken ct = default)
    {
        var equipmentIds = await Filter(db.FuelTransactions.AsNoTracking(), q).Select(f => f.EquipmentId).Distinct().ToListAsync(ct);
        var equipmentMap = await db.Equipment.AsNoTracking().Include(x => x.FuelType).Where(x => equipmentIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var threshold = (await settings.GetEntityAsync(ct)).FuelAnomalyThresholdPercent;
        var all = await LoadConsumptionAsync(equipmentIds, threshold, ct);
        var amounts = await Filter(db.FuelTransactions.AsNoTracking(), q)
            .Select(f => new { f.EquipmentId, f.TotalAmount, f.Quantity }).ToListAsync(ct);

        return equipmentIds.Select(id =>
        {
            var dto = Scope(all.GetValueOrDefault(id), equipmentMap[id], q.From, q.To);
            var mine = amounts.Where(a => a.EquipmentId == id).ToList();
            return dto with { TotalFuel = mine.Sum(a => a.Quantity), TotalAmount = Money.Round(mine.Sum(a => a.TotalAmount)), Segments = [] };
        }).OrderByDescending(x => x.TotalFuel).ToList();
    }

    private sealed record EquipmentConsumption(FuelConsumptionSummary Summary, Dictionary<int, (decimal Quantity, decimal Amount)> Fills, HashSet<int> Anomalies);

    private async Task<Dictionary<int, EquipmentConsumption>> LoadConsumptionAsync(List<int> equipmentIds, decimal threshold, CancellationToken ct)
    {
        var fills = await db.FuelTransactions.AsNoTracking().Where(f => equipmentIds.Contains(f.EquipmentId))
            .Select(f => new { f.EquipmentId, f.Id, f.FuelDate, f.Quantity, f.MeterReading, f.IsFullTank, f.TotalAmount }).ToListAsync(ct);
        var corrections = await db.MeterReadings.AsNoTracking().Where(r => equipmentIds.Contains(r.EquipmentId) && r.IsCorrection)
            .Select(r => new { r.EquipmentId, r.ReadingDate }).ToListAsync(ct);

        var result = new Dictionary<int, EquipmentConsumption>();
        foreach (var g in fills.GroupBy(f => f.EquipmentId))
        {
            var summary = FuelConsumptionCalculator.Calculate(
                g.Select(f => new FuelFill(f.Id, f.FuelDate, f.Quantity, f.MeterReading, f.IsFullTank)),
                corrections.Where(c => c.EquipmentId == g.Key).Select(c => c.ReadingDate));
            var avg = summary.AverageUnitsPerMeter;
            var anomalies = summary.Segments.Where(s => FuelConsumptionCalculator.IsAnomalous(s, avg, threshold)).Select(s => s.FillId).ToHashSet();
            result[g.Key] = new EquipmentConsumption(summary, g.ToDictionary(f => f.Id, f => (f.Quantity, f.TotalAmount)), anomalies);
        }
        return result;
    }

    /// <summary>Segments are computed over full history (so the first fill in range has its anchor) then filtered to the range.</summary>
    private static FuelConsumptionDto Scope(EquipmentConsumption? data, Domain.Entities.Equipment e, DateOnly? from, DateOnly? to)
    {
        var unit = e.FuelType?.Unit ?? "لتر";
        if (data is null)
            return new FuelConsumptionDto(e.Id, e.Name, e.MeterType, unit, 0, 0, 0, 0, 0, null, null, null, 0, []);

        var segs = data.Summary.Segments.Where(s => (from is null || s.Date >= from) && (to is null || s.Date <= to)).ToList();
        var valid = segs.Where(s => s.IsValid).ToList();
        var dist = valid.Sum(s => s.Distance);
        var fuel = valid.Sum(s => s.Fuel);
        var inRange = segs.Select(s => data.Fills[s.FillId]).ToList();

        return new FuelConsumptionDto(e.Id, e.Name, e.MeterType, unit,
            inRange.Sum(f => f.Quantity), Money.Round(inRange.Sum(f => f.Amount)), dist, fuel, valid.Count,
            fuel > 0 ? Math.Round(dist / fuel, 3) : null,
            dist > 0 ? Math.Round(fuel / dist * 100, 2) : null,
            dist > 0 ? Math.Round(fuel / dist, 3) : null,
            segs.Count(s => data.Anomalies.Contains(s.FillId)),
            segs.OrderByDescending(s => s.Date).Select(s => new FuelSegmentDto(s.FillId, s.Date, s.StartMeter, s.EndMeter, s.Distance, s.Fuel, s.Status,
                s.MeterPerUnit is { } m ? Math.Round(m, 3) : null, s.UnitsPer100 is { } u ? Math.Round(u, 2) : null,
                s.UnitsPerMeter is { } upm ? Math.Round(upm, 3) : null, data.Anomalies.Contains(s.FillId))).ToList());
    }
}
