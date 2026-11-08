using Fleet.Domain.Common;
using Fleet.Domain.Enums;

namespace Fleet.Domain.Calculations;

public sealed record StatusSpan(EquipmentStatus Status, DateOnly From, DateOnly? To);

public sealed record UtilizationResult(int PeriodDays, IReadOnlyDictionary<EquipmentStatus, int> DaysByStatus)
{
    public int Days(EquipmentStatus s) => DaysByStatus.TryGetValue(s, out var d) ? d : 0;
    public int DowntimeDays => Days(EquipmentStatus.UnderMaintenance) + Days(EquipmentStatus.OutOfService);
    public int AvailableBase => PeriodDays - Days(EquipmentStatus.Inactive);

    /// <summary>Operating days / (period days − inactive days), as a percentage.</summary>
    public decimal? UtilizationPercent => AvailableBase > 0 ? Math.Round(100m * Days(EquipmentStatus.Operating) / AvailableBase, 1) : null;
}

public static class UtilizationCalculator
{
    public static UtilizationResult Calculate(IEnumerable<StatusSpan> history, DateOnly from, DateOnly to)
    {
        var period = new DateRange(from, to);
        var days = new Dictionary<EquipmentStatus, int>();
        foreach (var span in history)
        {
            var overlap = new DateRange(span.From, span.To).Intersect(period);
            if (overlap is null) continue;
            days[span.Status] = days.GetValueOrDefault(span.Status) + overlap.Value.Days;
        }
        return new UtilizationResult(period.Days, days);
    }
}
