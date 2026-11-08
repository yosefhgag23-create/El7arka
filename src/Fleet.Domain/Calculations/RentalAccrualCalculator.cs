using Fleet.Domain.Common;
using Fleet.Domain.Enums;

namespace Fleet.Domain.Calculations;

public sealed record RentalAccrualLine(
    int? ProjectId,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    int Days,
    decimal? Usage,
    decimal Amount,
    bool PendingUsage);

/// <summary>
/// Computes the rental cost of one contract for one calendar month, split by project assignment days.
/// Monthly: Rate × days / daysInMonth. Daily: Rate × days. Hourly/PerKm: Rate × meter usage in the slice.
/// </summary>
public static class RentalAccrualCalculator
{
    public static IReadOnlyList<RentalAccrualLine> CalculateMonth(
        RentalRateType rateType,
        decimal rate,
        DateRange contract,
        int year,
        int month,
        DateOnly accrueUntil,
        IEnumerable<AssignmentSpan> assignments,
        Func<DateOnly, DateOnly, decimal?> usageProvider)
    {
        var monthRange = DateRange.Month(year, month);
        var active = monthRange.Intersect(contract)?.Intersect(new DateRange(DateOnly.MinValue, accrueUntil));
        if (active is null) return [];

        var daysInMonth = monthRange.Days;
        var slices = CostAllocationCalculator.SplitByProject(active.Value.Start, active.Value.End!.Value, assignments);

        return slices.Select(slice =>
        {
            switch (rateType)
            {
                case RentalRateType.Monthly:
                    return new RentalAccrualLine(slice.ProjectId, slice.Start, slice.End, slice.Days, null,
                        Money.Round(rate * slice.Days / daysInMonth), false);
                case RentalRateType.Daily:
                    return new RentalAccrualLine(slice.ProjectId, slice.Start, slice.End, slice.Days, null,
                        Money.Round(rate * slice.Days), false);
                default:
                    var usage = usageProvider(slice.Start, slice.End);
                    return usage is null
                        ? new RentalAccrualLine(slice.ProjectId, slice.Start, slice.End, slice.Days, null, 0, true)
                        : new RentalAccrualLine(slice.ProjectId, slice.Start, slice.End, slice.Days, usage,
                            Money.Round(rate * usage.Value), false);
            }
        }).ToList();
    }
}
