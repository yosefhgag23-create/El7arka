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

namespace Fleet.Application.Maintenance;

public record MaintenanceQuery : PageQuery
{
    public int? EquipmentId { get; init; }
    public int? ProjectId { get; init; }
    public int? MaintenanceTypeId { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
}

public record MaintenanceListItem(int Id, DateOnly MaintenanceDate, int EquipmentId, string EquipmentCode, string EquipmentName, int? ProjectId,
    string? ProjectName, int MaintenanceTypeId, string MaintenanceTypeName, decimal? MeterReading, string? Description, string? Workshop,
    decimal PartsCost, decimal LaborCost, decimal OtherCost, decimal TotalCost, int? DowntimeDays, DateOnly? NextDueDate, decimal? NextDueMeter,
    int? AttachmentId, string? Notes);

public record MaintenanceInput(int EquipmentId, int? ProjectId, int MaintenanceTypeId, DateOnly MaintenanceDate, decimal? MeterReading,
    string? Description, string? Workshop, decimal PartsCost, decimal LaborCost, decimal OtherCost, int? DowntimeDays,
    DateOnly? NextDueDate, decimal? NextDueMeter, int? AttachmentId, string? Notes);

public record MaintenancePlanDto(int Id, int EquipmentId, string EquipmentName, int MaintenanceTypeId, string MaintenanceTypeName,
    int? IntervalKm, int? IntervalHours, int? IntervalDays, DateOnly? LastDoneDate, decimal? LastDoneMeter, bool IsActive, string? Notes);

public record MaintenancePlanInput(int EquipmentId, int MaintenanceTypeId, int? IntervalKm, int? IntervalHours, int? IntervalDays,
    DateOnly? LastDoneDate, decimal? LastDoneMeter, bool IsActive, string? Notes);

public record MaintenanceReminder(int EquipmentId, string EquipmentCode, string EquipmentName, MeterType MeterType, decimal CurrentMeter,
    int MaintenanceTypeId, string MaintenanceTypeName, DateOnly? LastDoneDate, decimal? LastDoneMeter, DateOnly? NextDueDate,
    decimal? NextDueMeter, int? DaysRemaining, decimal? MeterRemaining, MaintenanceDueStatus Status, int? PlanId);

public class MaintenanceInputValidator : AbstractValidator<MaintenanceInput>
{
    public MaintenanceInputValidator()
    {
        RuleFor(x => x.EquipmentId).GreaterThan(0).WithMessage("المعدة مطلوبة");
        RuleFor(x => x.MaintenanceTypeId).GreaterThan(0).WithMessage("نوع الصيانة مطلوب");
        RuleFor(x => x.PartsCost).NonNegativeMoney();
        RuleFor(x => x.LaborCost).NonNegativeMoney();
        RuleFor(x => x.OtherCost).NonNegativeMoney();
        RuleFor(x => x.MeterReading).GreaterThanOrEqualTo(0).When(x => x.MeterReading.HasValue).WithMessage("قراءة العداد لا يمكن أن تكون سالبة");
        RuleFor(x => x.DowntimeDays).InclusiveBetween(0, 3650).When(x => x.DowntimeDays.HasValue).WithMessage("أيام التوقف غير صالحة");
        RuleFor(x => x.NextDueDate).GreaterThan(x => x.MaintenanceDate).When(x => x.NextDueDate.HasValue)
            .WithMessage("موعد الصيانة القادمة يجب أن يكون بعد تاريخ الصيانة");
        RuleFor(x => x.NextDueMeter).GreaterThan(x => x.MeterReading ?? 0).When(x => x.NextDueMeter.HasValue)
            .WithMessage("عداد الصيانة القادمة يجب أن يكون أكبر من القراءة الحالية");
        RuleFor(x => x.Description).OptionalText(2000);
        RuleFor(x => x.Workshop).OptionalText(200);
        RuleFor(x => x.Notes).OptionalText(2000);
    }
}

public class MaintenancePlanValidator : AbstractValidator<MaintenancePlanInput>
{
    public MaintenancePlanValidator()
    {
        RuleFor(x => x.EquipmentId).GreaterThan(0);
        RuleFor(x => x.MaintenanceTypeId).GreaterThan(0);
        RuleFor(x => x).Must(x => x.IntervalKm > 0 || x.IntervalHours > 0 || x.IntervalDays > 0)
            .WithName("intervalDays").WithMessage("حدد فترة الصيانة بالكيلومترات أو الساعات أو الأيام");
        RuleFor(x => x.IntervalKm).GreaterThan(0).When(x => x.IntervalKm.HasValue);
        RuleFor(x => x.IntervalHours).GreaterThan(0).When(x => x.IntervalHours.HasValue);
        RuleFor(x => x.IntervalDays).GreaterThan(0).When(x => x.IntervalDays.HasValue);
    }
}

public class MaintenanceService(IAppDbContext db, IValidator<MaintenanceInput> validator, IValidator<MaintenancePlanInput> planValidator,
    IClock clock, MeterReadingService meters, LedgerService ledger, AssignmentLookup assignments, SettingsService settings)
{
    private static readonly Dictionary<string, Expression<Func<MaintenanceRecord, object?>>> Sorts = new(StringComparer.OrdinalIgnoreCase)
    {
        ["maintenanceDate"] = m => m.MaintenanceDate,
        ["totalCost"] = m => m.TotalCost,
        ["equipment"] = m => m.Equipment!.Code,
        ["type"] = m => m.MaintenanceType!.NameAr,
    };

    public static IQueryable<MaintenanceRecord> Filter(IQueryable<MaintenanceRecord> q, MaintenanceQuery f)
    {
        var search = Text.Clean(f.Search);
        return q.WhereIf(f.EquipmentId.HasValue, x => x.EquipmentId == f.EquipmentId)
            .WhereIf(f.ProjectId.HasValue, x => x.ProjectId == f.ProjectId)
            .WhereIf(f.MaintenanceTypeId.HasValue, x => x.MaintenanceTypeId == f.MaintenanceTypeId)
            .WhereIf(f.From.HasValue, x => x.MaintenanceDate >= f.From)
            .WhereIf(f.To.HasValue, x => x.MaintenanceDate <= f.To)
            .WhereIf(search != null, x => x.Equipment!.Name.Contains(search!) || x.Equipment.Code.Contains(search!)
                || (x.Workshop != null && x.Workshop.Contains(search!)) || (x.Description != null && x.Description.Contains(search!)));
    }

    public static readonly Expression<Func<MaintenanceRecord, MaintenanceListItem>> ToItem = m => new MaintenanceListItem(m.Id, m.MaintenanceDate,
        m.EquipmentId, m.Equipment!.Code, m.Equipment.Name, m.ProjectId, m.Project!.Name, m.MaintenanceTypeId, m.MaintenanceType!.NameAr,
        m.MeterReading, m.Description, m.Workshop, m.PartsCost, m.LaborCost, m.OtherCost, m.TotalCost, m.DowntimeDays, m.NextDueDate,
        m.NextDueMeter, m.AttachmentId, m.Notes);

    public Task<PagedResult<MaintenanceListItem>> ListAsync(MaintenanceQuery q, CancellationToken ct = default) =>
        Filter(db.MaintenanceRecords.AsNoTracking(), q).ApplySort(q, Sorts, m => m.MaintenanceDate, defaultDesc: true).ToPagedAsync(q, ToItem, ct);

    public async Task<MaintenanceListItem> GetAsync(int id, CancellationToken ct = default) =>
        await db.MaintenanceRecords.AsNoTracking().Where(m => m.Id == id).Select(ToItem).FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("سجل الصيانة", id);

    public async Task<int> CreateAsync(MaintenanceInput input, CancellationToken ct = default)
    {
        await validator.EnsureValidAsync(input, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var m = new MaintenanceRecord();
        var typeName = await ApplyAsync(m, input, ct);
        db.MaintenanceRecords.Add(m);
        await db.SaveChangesAsync(ct);
        await PostAsync(m, typeName, ct);
        await tx.CommitAsync(ct);
        return m.Id;
    }

    public async Task UpdateAsync(int id, MaintenanceInput input, CancellationToken ct = default)
    {
        await validator.EnsureValidAsync(input, ct);
        var m = await db.MaintenanceRecords.FindAsync([id], ct) ?? throw new NotFoundException("سجل الصيانة", id);
        var oldEquipment = m.EquipmentId;
        var oldType = m.MaintenanceTypeId;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var typeName = await ApplyAsync(m, input, ct);
        await PostAsync(m, typeName, ct);
        if (oldEquipment != m.EquipmentId || oldType != m.MaintenanceTypeId)
        {
            await meters.RefreshCurrentAsync(oldEquipment, ct);
            await RefreshPlanAsync(oldEquipment, oldType, ct);
        }
        await tx.CommitAsync(ct);
    }

    public async Task DeleteAsync(int id, string? reason, CancellationToken ct = default)
    {
        var m = await db.MaintenanceRecords.Include(x => x.MaintenanceType).FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new NotFoundException("سجل الصيانة", id);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        m.IsDeleted = true;
        m.DeletedAt = clock.UtcNow;
        m.DeleteReason = Text.Clean(reason);
        await meters.RemoveForSourceAsync(MeterReadingSource.Maintenance, id, ct);
        await ledger.SyncMaintenanceAsync(m, m.MaintenanceType!.NameAr, ct);
        await db.SaveChangesAsync(ct);
        await meters.RefreshCurrentAsync(m.EquipmentId, ct);
        await RefreshPlanAsync(m.EquipmentId, m.MaintenanceTypeId, ct);
        await tx.CommitAsync(ct);
    }

    private async Task PostAsync(MaintenanceRecord m, string typeName, CancellationToken ct)
    {
        await meters.RecordAsync(m.EquipmentId, m.MaintenanceDate, m.MeterReading, MeterReadingSource.Maintenance, m.Id, ct);
        await ledger.SyncMaintenanceAsync(m, typeName, ct);
        await db.SaveChangesAsync(ct);
        await meters.RefreshCurrentAsync(m.EquipmentId, ct);
        await RefreshPlanAsync(m.EquipmentId, m.MaintenanceTypeId, ct);
    }

    private async Task<string> ApplyAsync(MaintenanceRecord m, MaintenanceInput i, CancellationToken ct)
    {
        var e = await db.Equipment.FindAsync([i.EquipmentId], ct) ?? throw new DomainException("المعدة غير موجودة", "equipmentId");
        var type = await db.MaintenanceTypes.FindAsync([i.MaintenanceTypeId], ct) ?? throw new DomainException("نوع الصيانة غير موجود", "maintenanceTypeId");
        if (i.MaintenanceDate > clock.Today) throw new DomainException("لا يمكن تسجيل صيانة بتاريخ مستقبلي", "maintenanceDate");
        var projectId = i.ProjectId ?? await assignments.ProjectOnDateAsync(e.Id, i.MaintenanceDate, ct);

        m.EquipmentId = e.Id;
        m.ProjectId = projectId;
        m.MaintenanceTypeId = type.Id;
        m.MaintenanceDate = i.MaintenanceDate;
        m.MeterReading = i.MeterReading;
        m.Description = Text.Clean(i.Description);
        m.Workshop = Text.Clean(i.Workshop);
        m.PartsCost = Money.Round(i.PartsCost);
        m.LaborCost = Money.Round(i.LaborCost);
        m.OtherCost = Money.Round(i.OtherCost);
        m.TotalCost = m.PartsCost + m.LaborCost + m.OtherCost;
        m.DowntimeDays = i.DowntimeDays;
        m.NextDueDate = i.NextDueDate;
        m.NextDueMeter = i.NextDueMeter;
        m.AttachmentId = i.AttachmentId;
        m.Notes = Text.Clean(i.Notes);
        return type.NameAr;
    }

    /// <summary>Plan "last done" always reflects the latest non-deleted record of that type.</summary>
    private async Task RefreshPlanAsync(int equipmentId, int typeId, CancellationToken ct)
    {
        var plan = await db.MaintenancePlans.FirstOrDefaultAsync(p => p.EquipmentId == equipmentId && p.MaintenanceTypeId == typeId, ct);
        if (plan is null) return;
        var last = await db.MaintenanceRecords.Where(r => r.EquipmentId == equipmentId && r.MaintenanceTypeId == typeId)
            .OrderByDescending(r => r.MaintenanceDate).ThenByDescending(r => r.Id)
            .Select(r => new { r.MaintenanceDate, r.MeterReading }).FirstOrDefaultAsync(ct);
        if (last is null) return;
        plan.LastDoneDate = last.MaintenanceDate;
        plan.LastDoneMeter = last.MeterReading ?? plan.LastDoneMeter;
        await db.SaveChangesAsync(ct);
    }

    // ---------------- Plans ----------------

    public Task<List<MaintenancePlanDto>> PlansAsync(int? equipmentId, CancellationToken ct = default) =>
        db.MaintenancePlans.AsNoTracking().WhereIf(equipmentId.HasValue, p => p.EquipmentId == equipmentId)
            .OrderBy(p => p.Equipment!.Code).ThenBy(p => p.MaintenanceType!.SortOrder)
            .Select(p => new MaintenancePlanDto(p.Id, p.EquipmentId, p.Equipment!.Name, p.MaintenanceTypeId, p.MaintenanceType!.NameAr,
                p.IntervalKm, p.IntervalHours, p.IntervalDays, p.LastDoneDate, p.LastDoneMeter, p.IsActive, p.Notes))
            .ToListAsync(ct);

    public async Task<int> SavePlanAsync(int? id, MaintenancePlanInput input, CancellationToken ct = default)
    {
        await planValidator.EnsureValidAsync(input, ct);
        if (!await db.Equipment.AnyAsync(e => e.Id == input.EquipmentId, ct)) throw new DomainException("المعدة غير موجودة", "equipmentId");
        if (!await db.MaintenanceTypes.AnyAsync(t => t.Id == input.MaintenanceTypeId, ct)) throw new DomainException("نوع الصيانة غير موجود", "maintenanceTypeId");
        if (await db.MaintenancePlans.AnyAsync(p => p.EquipmentId == input.EquipmentId && p.MaintenanceTypeId == input.MaintenanceTypeId && p.Id != id, ct))
            throw new DomainException("يوجد جدول صيانة لنفس النوع لهذه المعدة", "maintenanceTypeId");

        MaintenancePlan plan;
        if (id is null) { plan = new MaintenancePlan(); db.MaintenancePlans.Add(plan); }
        else plan = await db.MaintenancePlans.FindAsync([id.Value], ct) ?? throw new NotFoundException("جدول الصيانة", id);

        plan.EquipmentId = input.EquipmentId;
        plan.MaintenanceTypeId = input.MaintenanceTypeId;
        plan.IntervalKm = input.IntervalKm;
        plan.IntervalHours = input.IntervalHours;
        plan.IntervalDays = input.IntervalDays;
        plan.LastDoneDate = input.LastDoneDate;
        plan.LastDoneMeter = input.LastDoneMeter;
        plan.IsActive = input.IsActive;
        plan.Notes = Text.Clean(input.Notes);
        await db.SaveChangesAsync(ct);
        if (input.LastDoneDate is null) await RefreshPlanAsync(plan.EquipmentId, plan.MaintenanceTypeId, ct);
        return plan.Id;
    }

    public async Task DeletePlanAsync(int id, CancellationToken ct = default)
    {
        var plan = await db.MaintenancePlans.FindAsync([id], ct) ?? throw new NotFoundException("جدول الصيانة", id);
        db.MaintenancePlans.Remove(plan);
        await db.SaveChangesAsync(ct);
    }

    // ---------------- Reminders ----------------

    /// <summary>
    /// Reminders come from active plans (interval-based) and from the latest record of each type with an explicit next due date/meter.
    /// An explicit next due on the latest record overrides the plan interval.
    /// </summary>
    public async Task<List<MaintenanceReminder>> RemindersAsync(int? equipmentId = null, bool dueOnly = false, CancellationToken ct = default)
    {
        var s = await settings.GetEntityAsync(ct);
        var today = clock.Today;

        var equipment = await db.Equipment.AsNoTracking().Where(e => e.IsActive).WhereIf(equipmentId.HasValue, e => e.Id == equipmentId)
            .Select(e => new { e.Id, e.Code, e.Name, e.MeterType, e.CurrentMeterReading }).ToDictionaryAsync(e => e.Id, ct);
        var ids = equipment.Keys.ToList();

        var plans = await db.MaintenancePlans.AsNoTracking().Where(p => p.IsActive && ids.Contains(p.EquipmentId)).ToListAsync(ct);
        var latest = (await db.MaintenanceRecords.AsNoTracking().Where(r => ids.Contains(r.EquipmentId))
                .Select(r => new { r.Id, r.EquipmentId, r.MaintenanceTypeId, r.MaintenanceDate, r.MeterReading, r.NextDueDate, r.NextDueMeter })
                .ToListAsync(ct))
            .GroupBy(r => (r.EquipmentId, r.MaintenanceTypeId))
            .ToDictionary(g => g.Key, g => g.OrderByDescending(r => r.MaintenanceDate).ThenByDescending(r => r.Id).First());
        var types = await db.MaintenanceTypes.AsNoTracking().ToDictionaryAsync(t => t.Id, t => t.NameAr, ct);

        var keys = plans.Select(p => (p.EquipmentId, p.MaintenanceTypeId))
            .Union(latest.Where(l => l.Value.NextDueDate != null || l.Value.NextDueMeter != null).Select(l => l.Key))
            .Distinct();

        var result = new List<MaintenanceReminder>();
        foreach (var key in keys)
        {
            if (!equipment.TryGetValue(key.EquipmentId, out var e)) continue;
            var plan = plans.FirstOrDefault(p => p.EquipmentId == key.EquipmentId && p.MaintenanceTypeId == key.MaintenanceTypeId);
            latest.TryGetValue(key, out var rec);
            var hours = e.MeterType == MeterType.EngineHours;
            var lastDate = rec?.MaintenanceDate ?? plan?.LastDoneDate;
            var lastMeter = rec?.MeterReading ?? plan?.LastDoneMeter;

            var due = MaintenanceDueCalculator.Evaluate(
                new MaintenanceDueInput(lastDate, lastMeter, plan?.IntervalDays, hours ? plan?.IntervalHours : plan?.IntervalKm, today,
                    e.CurrentMeterReading, s.MaintenanceDueSoonDays, hours ? s.MaintenanceDueSoonHours : s.MaintenanceDueSoonKm),
                rec?.NextDueDate, rec?.NextDueMeter);

            if (due.NextDueDate is null && due.NextDueMeter is null) continue;
            if (dueOnly && due.Status == MaintenanceDueStatus.Ok) continue;

            result.Add(new MaintenanceReminder(e.Id, e.Code, e.Name, e.MeterType, e.CurrentMeterReading, key.MaintenanceTypeId,
                types.GetValueOrDefault(key.MaintenanceTypeId, ""), lastDate, lastMeter, due.NextDueDate, due.NextDueMeter, due.DaysRemaining,
                due.MeterRemaining, due.Status, plan?.Id));
        }
        return result.OrderByDescending(r => r.Status).ThenBy(r => r.DaysRemaining ?? int.MaxValue).ToList();
    }
}
