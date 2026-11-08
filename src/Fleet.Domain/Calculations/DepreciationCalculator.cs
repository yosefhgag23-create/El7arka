using Fleet.Domain.Common;

namespace Fleet.Domain.Calculations;

public sealed record DepreciationInput(
    decimal PurchasePrice,
    decimal ResidualValue,
    int UsefulLifeMonths,
    DateOnly StartDate,
    DateOnly? DisposalDate = null);

public sealed record DepreciationScheduleRow(DateOnly PeriodStart, DateOnly PeriodEnd, decimal Depreciation, decimal Accumulated, decimal BookValue);

/// <summary>
/// Straight-line depreciation prorated by exact days.
/// Useful-life window = [StartDate, StartDate + UsefulLifeMonths) and stops on the disposal date (inclusive).
/// Depreciation is a non-cash accounting figure and is never posted to the expense ledger.
/// </summary>
public static class DepreciationCalculator
{
    public static decimal Depreciable(DepreciationInput i) => Math.Max(0, i.PurchasePrice - i.ResidualValue);

    public static DateOnly WindowEnd(DepreciationInput i) => i.StartDate.AddMonths(i.UsefulLifeMonths).AddDays(-1);

    public static int TotalDays(DepreciationInput i) => WindowEnd(i).DayNumber - i.StartDate.DayNumber + 1;

    public static decimal MonthlyNominal(DepreciationInput i) =>
        i.UsefulLifeMonths <= 0 ? 0 : Money.Round(Depreciable(i) / i.UsefulLifeMonths);

    public static decimal AnnualNominal(DepreciationInput i) =>
        i.UsefulLifeMonths <= 0 ? 0 : Money.Round(Depreciable(i) * 12 / i.UsefulLifeMonths);

    private static DateRange ActiveRange(DepreciationInput i)
    {
        var end = WindowEnd(i);
        if (i.DisposalDate is { } d && d < end) end = d;
        return new DateRange(i.StartDate, end);
    }

    private static decimal Unrounded(DepreciationInput i, DateOnly from, DateOnly to)
    {
        if (i.UsefulLifeMonths <= 0 || to < from) return 0;
        var active = ActiveRange(i);
        if (active.End < active.Start) return 0;
        var overlap = active.Intersect(new DateRange(from, to));
        if (overlap is null) return 0;
        return Depreciable(i) * overlap.Value.Days / TotalDays(i);
    }

    /// <summary>Depreciation expense for an inclusive date range.</summary>
    public static decimal ForPeriod(DepreciationInput i, DateOnly from, DateOnly to) => Money.Round(Unrounded(i, from, to));

    public static decimal AccumulatedAsOf(DepreciationInput i, DateOnly asOf) =>
        Money.Round(Math.Min(Unrounded(i, i.StartDate, asOf), Depreciable(i)));

    public static decimal BookValueAsOf(DepreciationInput i, DateOnly asOf) => i.PurchasePrice - AccumulatedAsOf(i, asOf);

    public static bool IsFullyDepreciated(DepreciationInput i, DateOnly asOf) => asOf >= WindowEnd(i);

    /// <summary>Monthly schedule between two dates (inclusive). Accumulated values are derived from totals to avoid drift.</summary>
    public static IReadOnlyList<DepreciationScheduleRow> MonthlySchedule(DepreciationInput i, DateOnly from, DateOnly to)
    {
        var rows = new List<DepreciationScheduleRow>();
        var cursor = new DateOnly(from.Year, from.Month, 1);
        while (cursor <= to)
        {
            var monthEnd = cursor.AddMonths(1).AddDays(-1);
            var start = cursor < from ? from : cursor;
            var end = monthEnd > to ? to : monthEnd;
            var accumulated = AccumulatedAsOf(i, end);
            var accumulatedBefore = AccumulatedAsOf(i, start.AddDays(-1));
            rows.Add(new(start, end, accumulated - accumulatedBefore, accumulated, i.PurchasePrice - accumulated));
            cursor = cursor.AddMonths(1);
        }
        return rows;
    }
}
