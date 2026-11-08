using System.Linq.Expressions;
using Fleet.Application.Abstractions;
using Fleet.Application.Common;
using Fleet.Domain.Calculations;
using Fleet.Domain.Common;
using Fleet.Domain.Entities;
using Fleet.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Overtime;

public record OvertimeQuery : PageQuery
{
    public int? DriverId { get; init; }
    public int? EquipmentId { get; init; }
    public int? ProjectId { get; init; }
    public ApprovalStatus? ApprovalStatus { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
}

public record OvertimeListItem(int Id, DateOnly WorkDate, int DriverId, string DriverName, int? EquipmentId, string? EquipmentName, int? ProjectId,
    string? ProjectName, decimal NormalHours, decimal OvertimeHours, decimal HourlyRate, decimal Amount, string? Description,
    ApprovalStatus ApprovalStatus, DateTime? ApprovedAt, string? ApprovedBy);

public record OvertimeInput(int DriverId, int? EquipmentId, int? ProjectId, DateOnly WorkDate, decimal? NormalHours, decimal OvertimeHours,
    decimal? HourlyRate, string? Description);

public record OvertimeRateDto(int Id, int? DriverId, string? DriverName, decimal HourlyRate, DateOnly EffectiveFrom, DateOnly? EffectiveTo, string? Notes);

public record OvertimeRateInput(int? DriverId, decimal HourlyRate, DateOnly EffectiveFrom, DateOnly? EffectiveTo, string? Notes);

public record ApprovalInput(ApprovalStatus Status);

public class OvertimeInputValidator : AbstractValidator<OvertimeInput>
{
    public OvertimeInputValidator()
    {
        RuleFor(x => x.DriverId).GreaterThan(0).WithMessage("السائق مطلوب");
        RuleFor(x => x.OvertimeHours).GreaterThan(0).WithMessage("الساعات الإضافية يجب أن تكون أكبر من صفر")
            .LessThanOrEqualTo(24).WithMessage("الساعات الإضافية لا تتجاوز 24 ساعة في اليوم");
        RuleFor(x => x.NormalHours).InclusiveBetween(0, 24).When(x => x.NormalHours.HasValue).WithMessage("ساعات العمل بين 0 و 24");
        RuleFor(x => x).Must(x => (x.NormalHours ?? 0) + x.OvertimeHours <= 24).WithName("overtimeHours")
            .WithMessage("مجموع ساعات العمل والإضافي يتجاوز 24 ساعة");
        RuleFor(x => x.HourlyRate).GreaterThanOrEqualTo(0).When(x => x.HourlyRate.HasValue).WithMessage("السعر لا يمكن أن يكون سالباً");
        RuleFor(x => x.Description).OptionalText(1000);
    }
}

public class OvertimeService(IAppDbContext db, IValidator<OvertimeInput> validator, IClock clock, ICurrentUser user, LedgerService ledger,
    AssignmentLookup assignments, Settings.SettingsService settings)
{
    private static readonly Dictionary<string, Expression<Func<OvertimeRecord, object?>>> Sorts = new(StringComparer.OrdinalIgnoreCase)
    {
        ["workDate"] = o => o.WorkDate,
        ["amount"] = o => o.Amount,
        ["overtimeHours"] = o => o.OvertimeHours,
        ["driver"] = o => o.Driver!.FullName,
        ["approvalStatus"] = o => o.ApprovalStatus,
    };

    public static IQueryable<OvertimeRecord> Filter(IQueryable<OvertimeRecord> q, OvertimeQuery f)
    {
        var search = Text.Clean(f.Search);
        return q.WhereIf(f.DriverId.HasValue, x => x.DriverId == f.DriverId)
            .WhereIf(f.EquipmentId.HasValue, x => x.EquipmentId == f.EquipmentId)
            .WhereIf(f.ProjectId.HasValue, x => x.ProjectId == f.ProjectId)
            .WhereIf(f.ApprovalStatus.HasValue, x => x.ApprovalStatus == f.ApprovalStatus)
            .WhereIf(f.From.HasValue, x => x.WorkDate >= f.From)
            .WhereIf(f.To.HasValue, x => x.WorkDate <= f.To)
            .WhereIf(search != null, x => x.Driver!.FullName.Contains(search!) || (x.Description != null && x.Description.Contains(search!)));
    }

    public static readonly Expression<Func<OvertimeRecord, OvertimeListItem>> ToItem = o => new OvertimeListItem(o.Id, o.WorkDate, o.DriverId,
        o.Driver!.FullName, o.EquipmentId, o.Equipment!.Name, o.ProjectId, o.Project!.Name, o.NormalHours, o.OvertimeHours, o.HourlyRate, o.Amount,
        o.Description, o.ApprovalStatus, o.ApprovedAt, o.ApprovedBy);

    public Task<PagedResult<OvertimeListItem>> ListAsync(OvertimeQuery q, CancellationToken ct = default) =>
        Filter(db.OvertimeRecords.AsNoTracking(), q).ApplySort(q, Sorts, o => o.WorkDate, defaultDesc: true).ToPagedAsync(q, ToItem, ct);

    public async Task<OvertimeListItem> GetAsync(int id, CancellationToken ct = default) =>
        await db.OvertimeRecords.AsNoTracking().Where(o => o.Id == id).Select(ToItem).FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("سجل الإضافي", id);

    public async Task<int> CreateAsync(OvertimeInput input, CancellationToken ct = default)
    {
        await validator.EnsureValidAsync(input, ct);
        var o = new OvertimeRecord { ApprovalStatus = ApprovalStatus.Pending };
        await ApplyAsync(o, input, ct);
        db.OvertimeRecords.Add(o);
        await db.SaveChangesAsync(ct);
        return o.Id;
    }

    public async Task UpdateAsync(int id, OvertimeInput input, CancellationToken ct = default)
    {
        await validator.EnsureValidAsync(input, ct);
        var o = await db.OvertimeRecords.FindAsync([id], ct) ?? throw new NotFoundException("سجل الإضافي", id);
        if (o.ApprovalStatus == ApprovalStatus.Approved) user.RequireAdmin();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await ApplyAsync(o, input, ct);
        await ledger.SyncOvertimeAsync(o, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task SetApprovalAsync(int id, ApprovalStatus status, CancellationToken ct = default)
    {
        user.RequireAdmin();
        var o = await db.OvertimeRecords.FindAsync([id], ct) ?? throw new NotFoundException("سجل الإضافي", id);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        o.ApprovalStatus = status;
        o.ApprovedAt = status == ApprovalStatus.Pending ? null : clock.UtcNow;
        o.ApprovedBy = status == ApprovalStatus.Pending ? null : user.UserName;
        await ledger.SyncOvertimeAsync(o, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task DeleteAsync(int id, string? reason, CancellationToken ct = default)
    {
        var o = await db.OvertimeRecords.FindAsync([id], ct) ?? throw new NotFoundException("سجل الإضافي", id);
        if (o.ApprovalStatus == ApprovalStatus.Approved) user.RequireAdmin();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        o.IsDeleted = true;
        o.DeletedAt = clock.UtcNow;
        o.DeleteReason = Text.Clean(reason);
        await ledger.SyncOvertimeAsync(o, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    private async Task ApplyAsync(OvertimeRecord o, OvertimeInput i, CancellationToken ct)
    {
        if (!await db.Drivers.AnyAsync(d => d.Id == i.DriverId, ct)) throw new DomainException("السائق غير موجود", "driverId");
        if (i.WorkDate > clock.Today) throw new DomainException("لا يمكن تسجيل إضافي بتاريخ مستقبلي", "workDate");
        if (i.EquipmentId is { } eid && !await db.Equipment.AnyAsync(e => e.Id == eid, ct)) throw new DomainException("المعدة غير موجودة", "equipmentId");

        var duplicate = await db.OvertimeRecords.AnyAsync(x => x.Id != o.Id && x.DriverId == i.DriverId && x.WorkDate == i.WorkDate
            && x.EquipmentId == i.EquipmentId, ct);
        if (duplicate) throw new DomainException("يوجد سجل إضافي لنفس السائق والمعدة في نفس اليوم", "workDate");

        var rate = i.HourlyRate ?? await ResolveRateAsync(i.DriverId, i.WorkDate, ct)
            ?? throw new DomainException("لا يوجد سعر ساعة إضافي ساري في هذا التاريخ. أضف السعر في الإعدادات أو أدخله يدوياً.", "hourlyRate");
        var projectId = i.ProjectId ?? (i.EquipmentId is { } e ? await assignments.ProjectOnDateAsync(e, i.WorkDate, ct) : null);
        var normal = i.NormalHours ?? (await settings.GetEntityAsync(ct)).DefaultWorkingHours;

        o.DriverId = i.DriverId;
        o.EquipmentId = i.EquipmentId;
        o.ProjectId = projectId;
        o.WorkDate = i.WorkDate;
        o.NormalHours = normal;
        o.OvertimeHours = i.OvertimeHours;
        o.HourlyRate = rate;
        o.Amount = OvertimeCalculator.Amount(i.OvertimeHours, rate);
        o.Description = Text.Clean(i.Description);
    }

    public async Task<decimal?> ResolveRateAsync(int driverId, DateOnly date, CancellationToken ct = default)
    {
        var rates = await db.OvertimeRates.AsNoTracking().Where(r => r.DriverId == null || r.DriverId == driverId)
            .Select(r => new RateEntry(r.DriverId, r.HourlyRate, r.EffectiveFrom, r.EffectiveTo)).ToListAsync(ct);
        return OvertimeCalculator.ResolveRate(driverId, date, rates);
    }

    // ---------------- Rates ----------------

    public Task<List<OvertimeRateDto>> RatesAsync(CancellationToken ct = default) =>
        db.OvertimeRates.AsNoTracking().OrderBy(r => r.DriverId != null).ThenBy(r => r.Driver!.FullName).ThenByDescending(r => r.EffectiveFrom)
            .Select(r => new OvertimeRateDto(r.Id, r.DriverId, r.Driver!.FullName, r.HourlyRate, r.EffectiveFrom, r.EffectiveTo, r.Notes))
            .ToListAsync(ct);

    public async Task<int> SaveRateAsync(int? id, OvertimeRateInput input, CancellationToken ct = default)
    {
        user.RequireAdmin();
        if (input.HourlyRate < 0) throw new DomainException("السعر لا يمكن أن يكون سالباً", "hourlyRate");
        if (input.EffectiveTo is not null && input.EffectiveTo < input.EffectiveFrom)
            throw new DomainException("تاريخ النهاية يجب أن يكون بعد تاريخ البداية", "effectiveTo");
        if (input.DriverId is { } d && !await db.Drivers.AnyAsync(x => x.Id == d, ct)) throw new DomainException("السائق غير موجود", "driverId");

        var range = new DateRange(input.EffectiveFrom, input.EffectiveTo);
        var others = await db.OvertimeRates.Where(r => r.DriverId == input.DriverId && r.Id != id)
            .Select(r => new { r.EffectiveFrom, r.EffectiveTo }).ToListAsync(ct);
        if (others.Any(o => new DateRange(o.EffectiveFrom, o.EffectiveTo).Overlaps(range)))
            throw new DomainException("فترة السعر تتداخل مع سعر آخر لنفس النطاق. حدد تاريخ نهاية للسعر السابق أولاً.", "effectiveFrom");

        OvertimeRate rate;
        if (id is null) { rate = new OvertimeRate(); db.OvertimeRates.Add(rate); }
        else rate = await db.OvertimeRates.FindAsync([id.Value], ct) ?? throw new NotFoundException("السعر", id);
        rate.DriverId = input.DriverId;
        rate.HourlyRate = input.HourlyRate;
        rate.EffectiveFrom = input.EffectiveFrom;
        rate.EffectiveTo = input.EffectiveTo;
        rate.Notes = Text.Clean(input.Notes);
        await db.SaveChangesAsync(ct);
        return rate.Id;
    }

    public async Task DeleteRateAsync(int id, CancellationToken ct = default)
    {
        user.RequireAdmin();
        var rate = await db.OvertimeRates.FindAsync([id], ct) ?? throw new NotFoundException("السعر", id);
        db.OvertimeRates.Remove(rate);
        await db.SaveChangesAsync(ct);
    }
}
