using Fleet.Application.Abstractions;
using Fleet.Domain.Common;
using Fleet.Domain.Entities;
using Fleet.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Common;

/// <summary>
/// Posts source records (fuel, maintenance, overtime, rental) into the single Expense ledger.
/// Each source owns its ledger rows; rows are matched by (Category, Project, PeriodStart) and updated in place.
/// </summary>
public class LedgerService(IAppDbContext db)
{
    public record LedgerLine(int CategoryId, int? EquipmentId, int? ProjectId, DateOnly Date, decimal Amount,
        string? Description, decimal? Quantity = null, decimal? UnitPrice = null, decimal? Meter = null,
        DateOnly? PeriodStart = null, DateOnly? PeriodEnd = null, int? AttachmentId = null);

    public async Task<int> CategoryIdAsync(ExpenseSystemKind kind, CancellationToken ct = default) =>
        await db.ExpenseCategories.Where(c => c.SystemKind == kind).OrderByDescending(c => c.IsSystem).ThenBy(c => c.Id)
            .Select(c => (int?)c.Id).FirstOrDefaultAsync(ct)
        ?? throw new DomainException($"لا يوجد بند مصروف من النوع {kind}. راجع الإعدادات.");

    public async Task SyncFuelAsync(FuelTransaction f, CancellationToken ct = default)
    {
        var categoryId = await db.FuelTypes.Where(t => t.Id == f.FuelTypeId).Select(t => t.ExpenseCategoryId).FirstAsync(ct);
        var lines = f.IsDeleted ? [] : new List<LedgerLine>
        {
            new(categoryId, f.EquipmentId, f.ProjectId, f.FuelDate, f.TotalAmount, $"تموين وقود {f.Quantity:0.##}",
                f.Quantity, f.PricePerUnit, f.MeterReading, AttachmentId: f.AttachmentId)
        };
        await SyncAsync(ExpenseSourceType.Fuel, f.Id, lines, ct);
    }

    public async Task SyncMaintenanceAsync(MaintenanceRecord m, string typeName, CancellationToken ct = default)
    {
        var lines = new List<LedgerLine>();
        if (!m.IsDeleted)
        {
            if (m.PartsCost > 0)
                lines.Add(new(await CategoryIdAsync(ExpenseSystemKind.SpareParts, ct), m.EquipmentId, m.ProjectId, m.MaintenanceDate,
                    m.PartsCost, $"قطع غيار - {typeName}", Meter: m.MeterReading, AttachmentId: m.AttachmentId));
            var labor = m.LaborCost + m.OtherCost;
            if (labor > 0)
                lines.Add(new(await CategoryIdAsync(ExpenseSystemKind.Maintenance, ct), m.EquipmentId, m.ProjectId, m.MaintenanceDate,
                    labor, $"صيانة - {typeName}", Meter: m.MeterReading, AttachmentId: m.AttachmentId));
        }
        await SyncAsync(ExpenseSourceType.Maintenance, m.Id, lines, ct);
    }

    public async Task SyncOvertimeAsync(OvertimeRecord o, CancellationToken ct = default)
    {
        var lines = new List<LedgerLine>();
        if (!o.IsDeleted && o.ApprovalStatus == ApprovalStatus.Approved && o.Amount > 0)
            lines.Add(new(await CategoryIdAsync(ExpenseSystemKind.Overtime, ct), o.EquipmentId, o.ProjectId, o.WorkDate, o.Amount,
                $"ساعات إضافية {o.OvertimeHours:0.##} س", o.OvertimeHours, o.HourlyRate));
        await SyncAsync(ExpenseSourceType.Overtime, o.Id, lines, ct);
    }

    /// <summary>Replaces the ledger rows of a source. Pass <paramref name="periodStart"/> to scope to one rental month.</summary>
    public async Task SyncAsync(ExpenseSourceType sourceType, int sourceId, IReadOnlyList<LedgerLine> lines,
        CancellationToken ct = default, DateOnly? periodStart = null)
    {
        var query = db.Expenses.Where(e => e.SourceType == sourceType && e.SourceId == sourceId);
        if (periodStart is not null) query = query.Where(e => e.PeriodStart == periodStart);
        var existing = await query.ToListAsync(ct);

        var unmatched = existing.ToList();
        foreach (var line in lines)
        {
            var row = unmatched.FirstOrDefault(e => e.CategoryId == line.CategoryId && e.ProjectId == line.ProjectId && e.PeriodStart == line.PeriodStart);
            if (row is null)
            {
                row = new Expense { SourceType = sourceType, SourceId = sourceId };
                db.Expenses.Add(row);
            }
            else
            {
                unmatched.Remove(row);
            }
            row.CategoryId = line.CategoryId;
            row.EquipmentId = line.EquipmentId;
            row.ProjectId = line.ProjectId;
            row.ExpenseDate = line.Date;
            row.Amount = line.Amount;
            row.Description = line.Description;
            row.Quantity = line.Quantity;
            row.UnitPrice = line.UnitPrice;
            row.MeterReading = line.Meter;
            row.PeriodStart = line.PeriodStart;
            row.PeriodEnd = line.PeriodEnd;
            row.AttachmentId = line.AttachmentId;
        }

        foreach (var row in unmatched)
        {
            row.IsDeleted = true;
            row.DeletedAt = DateTime.UtcNow;
            row.DeleteReason = "إلغاء أو تعديل السجل المصدر";
        }
    }

    public static bool IsManualAllowed(ExpenseSystemKind kind) =>
        kind is not (ExpenseSystemKind.Fuel or ExpenseSystemKind.Maintenance or ExpenseSystemKind.Rental or ExpenseSystemKind.Overtime);
}
