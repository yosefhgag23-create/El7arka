using Fleet.Domain.Enums;

namespace Fleet.Domain.Calculations;

public sealed record MaintenanceDueInput(
    DateOnly? LastDoneDate,
    decimal? LastDoneMeter,
    int? IntervalDays,
    int? IntervalMeter,
    DateOnly Today,
    decimal CurrentMeter,
    int DueSoonDays,
    int DueSoonMeter);

public sealed record MaintenanceDueResult(
    DateOnly? NextDueDate,
    decimal? NextDueMeter,
    int? DaysRemaining,
    decimal? MeterRemaining,
    MaintenanceDueStatus Status);

/// <summary>Whichever trigger (date or meter) is reached first determines the status.</summary>
public static class MaintenanceDueCalculator
{
    public static MaintenanceDueResult Evaluate(MaintenanceDueInput i, DateOnly? explicitNextDate = null, decimal? explicitNextMeter = null)
    {
        DateOnly? nextDate = explicitNextDate
            ?? (i.LastDoneDate is { } d && i.IntervalDays is > 0 ? d.AddDays(i.IntervalDays.Value) : null);
        decimal? nextMeter = explicitNextMeter
            ?? (i.LastDoneMeter is { } m && i.IntervalMeter is > 0 ? m + i.IntervalMeter.Value : null);

        int? daysRemaining = nextDate is null ? null : nextDate.Value.DayNumber - i.Today.DayNumber;
        decimal? meterRemaining = nextMeter is null ? null : nextMeter - i.CurrentMeter;

        var status = MaintenanceDueStatus.Ok;
        if (daysRemaining < 0 || meterRemaining <= 0)
            status = MaintenanceDueStatus.Overdue;
        else if (daysRemaining <= i.DueSoonDays || meterRemaining <= i.DueSoonMeter)
            status = MaintenanceDueStatus.DueSoon;

        return new MaintenanceDueResult(nextDate, nextMeter, daysRemaining, meterRemaining, status);
    }
}
