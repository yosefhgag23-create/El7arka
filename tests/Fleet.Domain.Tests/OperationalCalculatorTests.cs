using Fleet.Domain.Calculations;
using Fleet.Domain.Enums;

namespace Fleet.Domain.Tests;

public class OperationalCalculatorTests
{
    private static DateOnly D(int month, int day) => new(2026, month, day);

    [Fact]
    public void Overtime_amount_is_hours_times_rate()
    {
        Assert.Equal(187.5m, OvertimeCalculator.Amount(2.5m, 75m));
    }

    [Fact]
    public void Overtime_rate_prefers_driver_specific_then_default_by_effective_date()
    {
        RateEntry[] rates =
        [
            new(null, 50, D(1, 1), D(3, 31)),
            new(null, 60, D(4, 1), null),
            new(7, 80, D(2, 1), null),
        ];
        Assert.Equal(50m, OvertimeCalculator.ResolveRate(1, D(2, 15), rates));
        Assert.Equal(60m, OvertimeCalculator.ResolveRate(1, D(5, 1), rates));
        Assert.Equal(80m, OvertimeCalculator.ResolveRate(7, D(5, 1), rates));
        Assert.Equal(50m, OvertimeCalculator.ResolveRate(7, D(1, 15), rates));
        Assert.Null(OvertimeCalculator.ResolveRate(1, new DateOnly(2025, 1, 1), rates));
    }

    [Theory]
    [InlineData(10_000, 9_000, 0, 6, MaintenanceDueStatus.Ok)]       // 1000 km left, date far
    [InlineData(10_000, 9_700, 0, 6, MaintenanceDueStatus.DueSoon)]  // 300 km left
    [InlineData(10_000, 10_000, 0, 6, MaintenanceDueStatus.Overdue)] // reached km
    [InlineData(10_000, 5_000, 6, 20, MaintenanceDueStatus.DueSoon)] // date in 10 days
    [InlineData(10_000, 5_000, 6, 30, MaintenanceDueStatus.DueSoon)] // due today
    [InlineData(10_000, 5_000, 7, 1, MaintenanceDueStatus.Overdue)]  // date passed
    public void Maintenance_due_status_by_km_or_date(decimal nextKm, decimal current, int month, int day, MaintenanceDueStatus expected)
    {
        var input = new MaintenanceDueInput(D(1, 1), 5_000, 180, 5_000, month == 0 ? D(2, 1) : D(month, day), current, 14, 500);
        var result = MaintenanceDueCalculator.Evaluate(input);
        Assert.Equal(nextKm, result.NextDueMeter);
        Assert.Equal(D(6, 30), result.NextDueDate);
        Assert.Equal(expected, result.Status);
    }

    [Fact]
    public void Meter_validation_supports_backdated_entries()
    {
        MeterPoint[] pts = [new(D(1, 1), 1000), new(D(1, 10), 1500)];
        Assert.True(MeterReadingValidator.Validate(pts, D(1, 5), 1200).IsValid);
        var tooHigh = MeterReadingValidator.Validate(pts, D(1, 5), 1600);
        Assert.False(tooHigh.IsValid);
        Assert.Equal(1500, tooHigh.MaxAllowed);
        Assert.False(MeterReadingValidator.Validate(pts, D(1, 20), 1400).IsValid);
        Assert.True(MeterReadingValidator.Validate(pts, D(1, 20), 1500).IsValid);
    }

    [Fact]
    public void Meter_correction_resets_lower_bound()
    {
        MeterPoint[] pts = [new(D(1, 1), 90_000), new(D(1, 10), 50, IsCorrection: true)];
        Assert.True(MeterReadingValidator.Validate(pts, D(1, 15), 300).IsValid);
        Assert.False(MeterReadingValidator.Validate(pts, D(1, 15), 10).IsValid);
    }

    [Fact]
    public void Utilization_from_status_history()
    {
        var result = UtilizationCalculator.Calculate([
            new StatusSpan(EquipmentStatus.Operating, D(1, 1), D(1, 20)),
            new StatusSpan(EquipmentStatus.UnderMaintenance, D(1, 21), D(1, 25)),
            new StatusSpan(EquipmentStatus.Available, D(1, 26), null),
        ], D(1, 1), D(1, 31));

        Assert.Equal(31, result.PeriodDays);
        Assert.Equal(20, result.Days(EquipmentStatus.Operating));
        Assert.Equal(5, result.DowntimeDays);
        Assert.Equal(64.5m, result.UtilizationPercent);
    }
}
