using Fleet.Application.Abstractions;
using Fleet.Application.Common;
using Fleet.Application.Settings;
using Fleet.Domain.Calculations;
using Fleet.Domain.Entities;
using Fleet.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Fleet.Application.Equipments;

public record PendingRentalUsage(int ContractId, int EquipmentId, string EquipmentName, DateOnly PeriodStart, DateOnly PeriodEnd, RentalRateType RateType);

public record RentalAccrualResult(int ContractsProcessed, int LinesPosted, decimal TotalAmount, List<PendingRentalUsage> PendingUsage);

/// <summary>
/// Generates monthly rental ledger rows from contracts (idempotent). Each run recomputes every month in the
/// contract window so retroactive changes (assignments, meter readings, contract edits) are reflected.
/// </summary>
public class RentalAccrualService(IAppDbContext db, IClock clock, LedgerService ledger, AssignmentLookup assignments, SettingsService settings)
{
    public async Task<RentalAccrualResult> RunAllAsync(CancellationToken ct = default)
    {
        var ids = await db.RentalContracts.Select(c => c.Id).ToListAsync(ct);
        var pending = new List<PendingRentalUsage>();
        int lines = 0;
        decimal total = 0;
        foreach (var id in ids)
        {
            var r = await RunForContractAsync(id, ct);
            lines += r.LinesPosted;
            total += r.TotalAmount;
            pending.AddRange(r.PendingUsage);
        }
        return new RentalAccrualResult(ids.Count, lines, total, pending);
    }

    public async Task<RentalAccrualResult> RunForContractAsync(int contractId, CancellationToken ct = default)
    {
        var c = await db.RentalContracts.Include(x => x.Equipment).FirstOrDefaultAsync(x => x.Id == contractId, ct);
        if (c is null) return new RentalAccrualResult(0, 0, 0, []);

        var s = await settings.GetEntityAsync(ct);
        var today = clock.Today;
        var accrueUntil = s.RentalAccrueCurrentMonth ? today : new DateOnly(today.Year, today.Month, 1).AddDays(-1);
        if (c.EndDate is { } end && end < accrueUntil) accrueUntil = end;

        var categoryId = await ledger.CategoryIdAsync(ExpenseSystemKind.Rental, ct);
        var spans = (await assignments.SpansByEquipmentAsync([c.EquipmentId], ct)).GetValueOrDefault(c.EquipmentId) ?? [];
        var readings = await db.MeterReadings.Where(r => r.EquipmentId == c.EquipmentId)
            .OrderBy(r => r.ReadingDate).ThenBy(r => r.Id)
            .Select(r => new MeterPoint(r.ReadingDate, r.Value, r.IsCorrection)).ToListAsync(ct);

        var pending = new List<PendingRentalUsage>();
        int posted = 0;
        decimal total = 0;
        var validMonths = new HashSet<DateOnly>();

        await using var tx = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(ct) : null;

        for (var month = new DateOnly(c.StartDate.Year, c.StartDate.Month, 1); month <= accrueUntil; month = month.AddMonths(1))
        {
            validMonths.Add(month);
            var computed = RentalAccrualCalculator.CalculateMonth(c.RateType, c.Rate, c.Period, month.Year, month.Month, accrueUntil, spans,
                (from, to) => MeterReadingService.UsageInRange(readings, from, to));

            var lines = new List<LedgerService.LedgerLine>();
            foreach (var g in computed.Where(l => !l.PendingUsage).GroupBy(l => l.ProjectId))
            {
                var amount = g.Sum(l => l.Amount);
                if (amount <= 0) continue;
                var usage = g.Any(l => l.Usage.HasValue) ? g.Sum(l => l.Usage ?? 0) : (decimal?)null;
                lines.Add(new LedgerService.LedgerLine(categoryId, c.EquipmentId, g.Key, g.Max(l => l.PeriodEnd), amount,
                    $"إيجار {c.Lessor} ({g.Min(l => l.PeriodStart):dd/MM} - {g.Max(l => l.PeriodEnd):dd/MM/yyyy})",
                    usage ?? g.Sum(l => l.Days), usage is null ? null : c.Rate, PeriodStart: month, PeriodEnd: g.Max(l => l.PeriodEnd)));
                posted++;
                total += amount;
            }
            pending.AddRange(computed.Where(l => l.PendingUsage)
                .Select(l => new PendingRentalUsage(c.Id, c.EquipmentId, c.Equipment!.Name, l.PeriodStart, l.PeriodEnd, c.RateType)));

            await ledger.SyncAsync(ExpenseSourceType.Rental, c.Id, lines, ct, periodStart: month);
        }

        // Months no longer inside the contract window (e.g. contract shortened) are reversed.
        var stale = await db.Expenses.Where(e => e.SourceType == ExpenseSourceType.Rental && e.SourceId == c.Id).ToListAsync(ct);
        foreach (var row in stale.Where(r => r.PeriodStart is null || !validMonths.Contains(r.PeriodStart.Value)))
        {
            row.IsDeleted = true;
            row.DeletedAt = DateTime.UtcNow;
            row.DeleteReason = "خارج فترة العقد";
        }

        await db.SaveChangesAsync(ct);
        if (tx is not null) await tx.CommitAsync(ct);
        return new RentalAccrualResult(1, posted, total, pending);
    }
}
