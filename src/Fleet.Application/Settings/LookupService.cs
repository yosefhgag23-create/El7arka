using Fleet.Application.Abstractions;
using Fleet.Application.Common;
using Fleet.Domain.Common;
using Fleet.Domain.Entities;
using Fleet.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Settings;

public enum LookupKind { EquipmentCategories, FuelTypes, ExpenseCategories, MaintenanceTypes, LicenseTypes }

public record LookupDto(
    int Id, string NameAr, string? NameEn, int SortOrder, bool IsActive, bool IsSystem,
    string? Icon = null, int? DefaultUsefulLifeYears = null, decimal? DefaultResidualPercent = null,
    string? Unit = null, int? ExpenseCategoryId = null, ExpenseSystemKind? SystemKind = null,
    int? DefaultIntervalKm = null, int? DefaultIntervalHours = null, int? DefaultIntervalDays = null,
    bool ManualEntryAllowed = true);

public record LookupInput(
    string NameAr, string? NameEn, int SortOrder, bool IsActive,
    string? Icon = null, int? DefaultUsefulLifeYears = null, decimal? DefaultResidualPercent = null,
    string? Unit = null, int? ExpenseCategoryId = null, ExpenseSystemKind? SystemKind = null,
    int? DefaultIntervalKm = null, int? DefaultIntervalHours = null, int? DefaultIntervalDays = null);

public class LookupInputValidator : AbstractValidator<LookupInput>
{
    public LookupInputValidator()
    {
        RuleFor(x => x.NameAr).RequiredText(100);
        RuleFor(x => x.NameEn).OptionalText(100);
        RuleFor(x => x.DefaultUsefulLifeYears).InclusiveBetween(1, 50).When(x => x.DefaultUsefulLifeYears.HasValue).WithMessage("العمر الافتراضي بين 1 و 50 سنة");
        RuleFor(x => x.DefaultResidualPercent).InclusiveBetween(0, 100).When(x => x.DefaultResidualPercent.HasValue).WithMessage("النسبة بين 0 و 100");
        RuleFor(x => x.DefaultIntervalKm).GreaterThan(0).When(x => x.DefaultIntervalKm.HasValue).WithMessage("يجب أن تكون أكبر من صفر");
        RuleFor(x => x.DefaultIntervalHours).GreaterThan(0).When(x => x.DefaultIntervalHours.HasValue).WithMessage("يجب أن تكون أكبر من صفر");
        RuleFor(x => x.DefaultIntervalDays).GreaterThan(0).When(x => x.DefaultIntervalDays.HasValue).WithMessage("يجب أن تكون أكبر من صفر");
    }
}

public class LookupService(IAppDbContext db, IValidator<LookupInput> validator, ICurrentUser user)
{
    public async Task<List<LookupDto>> ListAsync(LookupKind kind, bool activeOnly, CancellationToken ct = default) => kind switch
    {
        LookupKind.EquipmentCategories => await Query(db.EquipmentCategories, activeOnly)
            .Select(x => new LookupDto(x.Id, x.NameAr, x.NameEn, x.SortOrder, x.IsActive, x.IsSystem, x.Icon, x.DefaultUsefulLifeYears, x.DefaultResidualPercent,
                null, null, null, null, null, null, true)).ToListAsync(ct),
        LookupKind.FuelTypes => await Query(db.FuelTypes, activeOnly)
            .Select(x => new LookupDto(x.Id, x.NameAr, x.NameEn, x.SortOrder, x.IsActive, x.IsSystem, null, null, null,
                x.Unit, x.ExpenseCategoryId, null, null, null, null, true)).ToListAsync(ct),
        LookupKind.ExpenseCategories => (await Query(db.ExpenseCategories, activeOnly).ToListAsync(ct))
            .Select(x => new LookupDto(x.Id, x.NameAr, x.NameEn, x.SortOrder, x.IsActive, x.IsSystem, SystemKind: x.SystemKind,
                ManualEntryAllowed: LedgerService.IsManualAllowed(x.SystemKind))).ToList(),
        LookupKind.MaintenanceTypes => await Query(db.MaintenanceTypes, activeOnly)
            .Select(x => new LookupDto(x.Id, x.NameAr, x.NameEn, x.SortOrder, x.IsActive, x.IsSystem, null, null, null, null, null, null,
                x.DefaultIntervalKm, x.DefaultIntervalHours, x.DefaultIntervalDays, true)).ToListAsync(ct),
        LookupKind.LicenseTypes => await Query(db.LicenseTypes, activeOnly)
            .Select(x => new LookupDto(x.Id, x.NameAr, x.NameEn, x.SortOrder, x.IsActive, x.IsSystem, null, null, null, null, null, null, null, null, null, true)).ToListAsync(ct),
        _ => throw new ArgumentOutOfRangeException(nameof(kind))
    };

    private static IQueryable<T> Query<T>(DbSet<T> set, bool activeOnly) where T : LookupEntity =>
        set.Where(x => !activeOnly || x.IsActive).OrderBy(x => x.SortOrder).ThenBy(x => x.NameAr);

    public async Task<int> CreateAsync(LookupKind kind, LookupInput input, CancellationToken ct = default)
    {
        user.RequireAdmin();
        await validator.EnsureValidAsync(input, ct);
        LookupEntity entity = kind switch
        {
            LookupKind.EquipmentCategories => db.EquipmentCategories.Add(new EquipmentCategory()).Entity,
            LookupKind.FuelTypes => db.FuelTypes.Add(new FuelType()).Entity,
            LookupKind.ExpenseCategories => db.ExpenseCategories.Add(new ExpenseCategory()).Entity,
            LookupKind.MaintenanceTypes => db.MaintenanceTypes.Add(new MaintenanceType()).Entity,
            LookupKind.LicenseTypes => db.LicenseTypes.Add(new LicenseType()).Entity,
            _ => throw new ArgumentOutOfRangeException(nameof(kind))
        };
        await ApplyAsync(entity, input, isNew: true, ct);
        await db.SaveChangesAsync(ct);
        return entity.Id;
    }

    public async Task UpdateAsync(LookupKind kind, int id, LookupInput input, CancellationToken ct = default)
    {
        user.RequireAdmin();
        await validator.EnsureValidAsync(input, ct);
        LookupEntity? entity = kind switch
        {
            LookupKind.EquipmentCategories => await db.EquipmentCategories.FindAsync([id], ct),
            LookupKind.FuelTypes => await db.FuelTypes.FindAsync([id], ct),
            LookupKind.ExpenseCategories => await db.ExpenseCategories.FindAsync([id], ct),
            LookupKind.MaintenanceTypes => await db.MaintenanceTypes.FindAsync([id], ct),
            LookupKind.LicenseTypes => await db.LicenseTypes.FindAsync([id], ct),
            _ => null
        };
        if (entity is null) throw new NotFoundException("العنصر", id);
        await ApplyAsync(entity, input, isNew: false, ct);
        await db.SaveChangesAsync(ct);
    }

    private async Task ApplyAsync(LookupEntity entity, LookupInput input, bool isNew, CancellationToken ct)
    {
        if (entity.IsSystem && !input.IsActive)
            throw new DomainException("لا يمكن إيقاف عنصر أساسي يستخدمه النظام في الحسابات", "isActive");

        entity.NameAr = input.NameAr.Trim();
        entity.NameEn = Text.Clean(input.NameEn);
        entity.SortOrder = input.SortOrder;
        entity.IsActive = input.IsActive;

        switch (entity)
        {
            case EquipmentCategory c:
                c.Icon = Text.Clean(input.Icon);
                c.DefaultUsefulLifeYears = input.DefaultUsefulLifeYears;
                c.DefaultResidualPercent = input.DefaultResidualPercent;
                break;
            case FuelType f:
                if (input.ExpenseCategoryId is null) throw new DomainException("بند المصروف المرتبط مطلوب", "expenseCategoryId");
                var cat = await db.ExpenseCategories.FindAsync([input.ExpenseCategoryId.Value], ct)
                    ?? throw new DomainException("بند المصروف غير موجود", "expenseCategoryId");
                if (cat.SystemKind != ExpenseSystemKind.Fuel)
                    throw new DomainException("يجب ربط نوع الوقود ببند مصروف من نوع وقود", "expenseCategoryId");
                f.ExpenseCategoryId = cat.Id;
                f.Unit = Text.Clean(input.Unit) ?? "لتر";
                break;
            case ExpenseCategory e:
                var kind = input.SystemKind ?? ExpenseSystemKind.None;
                if (!isNew && e.IsSystem && kind != e.SystemKind)
                    throw new DomainException("لا يمكن تغيير نوع بند أساسي", "systemKind");
                e.SystemKind = kind;
                break;
            case MaintenanceType m:
                m.DefaultIntervalKm = input.DefaultIntervalKm;
                m.DefaultIntervalHours = input.DefaultIntervalHours;
                m.DefaultIntervalDays = input.DefaultIntervalDays;
                break;
        }
    }
}
