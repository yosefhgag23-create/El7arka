using System.Linq.Expressions;
using Fleet.Application.Abstractions;
using Fleet.Application.Common;
using Fleet.Domain.Common;
using Fleet.Domain.Entities;
using Fleet.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Expenses;

public record ExpenseQuery : PageQuery
{
    public int? EquipmentId { get; init; }
    public int? ProjectId { get; init; }
    public int? CategoryId { get; init; }
    public ExpenseSourceType? SourceType { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
}

public record ExpenseListItem(int Id, DateOnly ExpenseDate, int? EquipmentId, string? EquipmentCode, string? EquipmentName, int? ProjectId,
    string? ProjectName, int CategoryId, string CategoryName, ExpenseSystemKind CategoryKind, decimal Amount, decimal? Quantity, decimal? UnitPrice,
    decimal? MeterReading, string? Description, ExpenseSourceType SourceType, int? SourceId, int? AttachmentId, string? Notes, bool IsReadOnly);

public record ExpenseInput(int? EquipmentId, int? ProjectId, int CategoryId, DateOnly ExpenseDate, decimal? Amount, decimal? Quantity,
    decimal? UnitPrice, decimal? MeterReading, string? Description, int? AttachmentId, string? Notes);

public class ExpenseInputValidator : AbstractValidator<ExpenseInput>
{
    public ExpenseInputValidator()
    {
        RuleFor(x => x.CategoryId).GreaterThan(0).WithMessage("بند المصروف مطلوب");
        RuleFor(x => x).Must(x => x.EquipmentId.HasValue || x.ProjectId.HasValue).WithName("equipmentId")
            .WithMessage("حدد المعدة أو المشروع");
        RuleFor(x => x).Must(x => x.Amount.HasValue || (x.Quantity.HasValue && x.UnitPrice.HasValue)).WithName("amount")
            .WithMessage("أدخل المبلغ أو الكمية وسعر الوحدة");
        RuleFor(x => x.Amount).GreaterThan(0).When(x => x.Amount.HasValue).WithMessage("المبلغ يجب أن يكون أكبر من صفر");
        RuleFor(x => x.Quantity).GreaterThan(0).When(x => x.Quantity.HasValue).WithMessage("الكمية يجب أن تكون أكبر من صفر");
        RuleFor(x => x.UnitPrice).GreaterThanOrEqualTo(0).When(x => x.UnitPrice.HasValue).WithMessage("السعر لا يمكن أن يكون سالباً");
        RuleFor(x => x.MeterReading).GreaterThanOrEqualTo(0).When(x => x.MeterReading.HasValue);
        RuleFor(x => x.Description).OptionalText(1000);
        RuleFor(x => x.Notes).OptionalText(2000);
    }
}

/// <summary>Manual ledger entries. System-posted rows (fuel/maintenance/overtime/rental) are listed but read-only here.</summary>
public class ExpenseService(IAppDbContext db, IValidator<ExpenseInput> validator, IClock clock, MeterReadingService meters, AssignmentLookup assignments)
{
    private static readonly Dictionary<string, Expression<Func<Expense, object?>>> Sorts = new(StringComparer.OrdinalIgnoreCase)
    {
        ["expenseDate"] = e => e.ExpenseDate,
        ["amount"] = e => e.Amount,
        ["category"] = e => e.Category!.NameAr,
        ["equipment"] = e => e.Equipment!.Code,
        ["project"] = e => e.Project!.Name,
    };

    public static IQueryable<Expense> Filter(IQueryable<Expense> q, ExpenseQuery f)
    {
        var search = Text.Clean(f.Search);
        return q.WhereIf(f.EquipmentId.HasValue, x => x.EquipmentId == f.EquipmentId)
            .WhereIf(f.ProjectId.HasValue, x => x.ProjectId == f.ProjectId)
            .WhereIf(f.CategoryId.HasValue, x => x.CategoryId == f.CategoryId)
            .WhereIf(f.SourceType.HasValue, x => x.SourceType == f.SourceType)
            .WhereIf(f.From.HasValue, x => x.ExpenseDate >= f.From)
            .WhereIf(f.To.HasValue, x => x.ExpenseDate <= f.To)
            .WhereIf(search != null, x => (x.Description != null && x.Description.Contains(search!)) || (x.Notes != null && x.Notes.Contains(search!))
                || (x.Equipment != null && (x.Equipment.Name.Contains(search!) || x.Equipment.Code.Contains(search!))));
    }

    public static readonly Expression<Func<Expense, ExpenseListItem>> ToItem = e => new ExpenseListItem(e.Id, e.ExpenseDate, e.EquipmentId,
        e.Equipment!.Code, e.Equipment.Name, e.ProjectId, e.Project!.Name, e.CategoryId, e.Category!.NameAr, e.Category.SystemKind, e.Amount,
        e.Quantity, e.UnitPrice, e.MeterReading, e.Description, e.SourceType, e.SourceId, e.AttachmentId, e.Notes, e.SourceType != ExpenseSourceType.Manual);

    public Task<PagedResult<ExpenseListItem>> ListAsync(ExpenseQuery q, CancellationToken ct = default) =>
        Filter(db.Expenses.AsNoTracking(), q).ApplySort(q, Sorts, e => e.ExpenseDate, defaultDesc: true).ToPagedAsync(q, ToItem, ct);

    public async Task<ExpenseListItem> GetAsync(int id, CancellationToken ct = default) =>
        await db.Expenses.AsNoTracking().Where(e => e.Id == id).Select(ToItem).FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("المصروف", id);

    public async Task<int> CreateAsync(ExpenseInput input, CancellationToken ct = default)
    {
        await validator.EnsureValidAsync(input, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var e = new Expense { SourceType = ExpenseSourceType.Manual };
        await ApplyAsync(e, input, ct);
        db.Expenses.Add(e);
        await db.SaveChangesAsync(ct);
        await RecordMeterAsync(e, ct);
        await tx.CommitAsync(ct);
        return e.Id;
    }

    public async Task UpdateAsync(int id, ExpenseInput input, CancellationToken ct = default)
    {
        await validator.EnsureValidAsync(input, ct);
        var e = await db.Expenses.FindAsync([id], ct) ?? throw new NotFoundException("المصروف", id);
        EnsureManual(e);
        var oldEquipment = e.EquipmentId;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await ApplyAsync(e, input, ct);
        await db.SaveChangesAsync(ct);
        await RecordMeterAsync(e, ct);
        if (oldEquipment is { } old && old != e.EquipmentId) await meters.RefreshCurrentAsync(old, ct);
        await tx.CommitAsync(ct);
    }

    public async Task DeleteAsync(int id, string? reason, CancellationToken ct = default)
    {
        var e = await db.Expenses.FindAsync([id], ct) ?? throw new NotFoundException("المصروف", id);
        EnsureManual(e);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        e.IsDeleted = true;
        e.DeletedAt = clock.UtcNow;
        e.DeleteReason = Text.Clean(reason);
        await meters.RemoveForSourceAsync(MeterReadingSource.Expense, id, ct);
        await db.SaveChangesAsync(ct);
        if (e.EquipmentId is { } eq) await meters.RefreshCurrentAsync(eq, ct);
        await tx.CommitAsync(ct);
    }

    private static void EnsureManual(Expense e)
    {
        if (e.SourceType != ExpenseSourceType.Manual)
            throw new DomainException("هذا المصروف مُرحّل تلقائياً من وحدة أخرى (وقود/صيانة/إضافي/إيجار). عدّله من مصدره.");
    }

    private async Task RecordMeterAsync(Expense e, CancellationToken ct)
    {
        if (e.EquipmentId is not { } eq)
        {
            await meters.RemoveForSourceAsync(MeterReadingSource.Expense, e.Id, ct);
            await db.SaveChangesAsync(ct);
            return;
        }
        await meters.RecordAsync(eq, e.ExpenseDate, e.MeterReading, MeterReadingSource.Expense, e.Id, ct);
        await db.SaveChangesAsync(ct);
        await meters.RefreshCurrentAsync(eq, ct);
    }

    private async Task ApplyAsync(Expense e, ExpenseInput i, CancellationToken ct)
    {
        var category = await db.ExpenseCategories.FindAsync([i.CategoryId], ct) ?? throw new DomainException("بند المصروف غير موجود", "categoryId");
        if (!category.IsActive) throw new DomainException("بند المصروف موقوف", "categoryId");
        if (!LedgerService.IsManualAllowed(category.SystemKind))
            throw new DomainException($"بند \"{category.NameAr}\" يُسجَّل من وحدته المخصصة (الوقود/الصيانة/الإضافي/الإيجار) لتجنب الازدواج", "categoryId");
        if (i.ExpenseDate > clock.Today) throw new DomainException("لا يمكن تسجيل مصروف بتاريخ مستقبلي", "expenseDate");
        if (i.EquipmentId is { } eq && !await db.Equipment.AnyAsync(x => x.Id == eq, ct)) throw new DomainException("المعدة غير موجودة", "equipmentId");
        if (i.ProjectId is { } p && !await db.Projects.AnyAsync(x => x.Id == p, ct)) throw new DomainException("المشروع غير موجود", "projectId");
        if (i.MeterReading is not null && i.EquipmentId is null) throw new DomainException("قراءة العداد تتطلب تحديد المعدة", "meterReading");

        decimal amount;
        if (i.Quantity is { } q && i.UnitPrice is { } up)
        {
            var computed = Domain.Calculations.Money.Round(q * up);
            if (i.Amount is { } a && Math.Abs(a - computed) > 0.05m)
                throw new DomainException($"المبلغ ({a:N2}) لا يساوي الكمية × السعر ({computed:N2})", "amount");
            amount = computed;
        }
        else amount = Domain.Calculations.Money.Round(i.Amount!.Value);

        e.EquipmentId = i.EquipmentId;
        e.ProjectId = i.ProjectId ?? (i.EquipmentId is { } eid ? await assignments.ProjectOnDateAsync(eid, i.ExpenseDate, ct) : null);
        e.CategoryId = category.Id;
        e.ExpenseDate = i.ExpenseDate;
        e.Amount = amount;
        e.Quantity = i.Quantity;
        e.UnitPrice = i.UnitPrice;
        e.MeterReading = i.MeterReading;
        e.Description = Text.Clean(i.Description);
        e.AttachmentId = i.AttachmentId;
        e.Notes = Text.Clean(i.Notes);
    }
}
