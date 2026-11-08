using Fleet.Domain.Calculations;
using Fleet.Domain.Common;
using Fleet.Domain.Enums;

namespace Fleet.Domain.Tests;

public class AllocationAndRentalTests
{
    private static DateOnly D(int month, int day) => new(2026, month, day);

    [Fact]
    public void Split_by_project_with_transfer_and_gap()
    {
        var slices = CostAllocationCalculator.SplitByProject(D(4, 1), D(4, 30), [
            new AssignmentSpan(1, D(3, 1), D(4, 10)),
            new AssignmentSpan(2, D(4, 15), null),
        ]);

        Assert.Equal(3, slices.Count);
        Assert.Equal((1, 10), (slices[0].ProjectId!.Value, slices[0].Days));
        Assert.Null(slices[1].ProjectId);
        Assert.Equal(4, slices[1].Days);
        Assert.Equal((2, 16), (slices[2].ProjectId!.Value, slices[2].Days));
        Assert.Equal(30, slices.Sum(s => s.Days));
    }

    [Fact]
    public void Allocate_preserves_total_with_rounding()
    {
        var slices = CostAllocationCalculator.SplitByProject(D(4, 1), D(4, 30), [
            new AssignmentSpan(1, D(4, 1), D(4, 10)),
            new AssignmentSpan(2, D(4, 11), D(4, 20)),
            new AssignmentSpan(3, D(4, 21), null),
        ]);
        var lines = CostAllocationCalculator.Allocate(1000m, slices);
        Assert.Equal(1000m, lines.Sum(l => l.Amount));
    }

    [Fact]
    public void Monthly_rent_prorated_by_days_and_split_by_project()
    {
        var lines = RentalAccrualCalculator.CalculateMonth(
            RentalRateType.Monthly, 30_000, new DateRange(D(1, 1), null), 2026, 4, D(4, 30),
            [new AssignmentSpan(1, D(1, 1), D(4, 10)), new AssignmentSpan(2, D(4, 11), null)],
            (_, _) => null);

        Assert.Equal(2, lines.Count);
        Assert.Equal(10_000m, lines[0].Amount);
        Assert.Equal(20_000m, lines[1].Amount);
    }

    [Fact]
    public void Contract_starting_mid_month_accrues_partial_month()
    {
        var lines = RentalAccrualCalculator.CalculateMonth(
            RentalRateType.Monthly, 31_000, new DateRange(D(1, 21), null), 2026, 1, D(1, 31), [], (_, _) => null);
        Assert.Single(lines);
        Assert.Null(lines[0].ProjectId);
        Assert.Equal(11_000m, lines[0].Amount);
    }

    [Fact]
    public void Daily_rent_only_until_accrual_date()
    {
        var lines = RentalAccrualCalculator.CalculateMonth(
            RentalRateType.Daily, 1_500, new DateRange(D(1, 1), null), 2026, 5, D(5, 10), [], (_, _) => null);
        Assert.Equal(15_000m, lines.Sum(l => l.Amount));
    }

    [Fact]
    public void Hourly_rent_uses_meter_usage_or_flags_pending()
    {
        var ok = RentalAccrualCalculator.CalculateMonth(
            RentalRateType.Hourly, 400, new DateRange(D(1, 1), null), 2026, 2, D(2, 28), [], (_, _) => 120);
        Assert.Equal(48_000m, ok[0].Amount);

        var pending = RentalAccrualCalculator.CalculateMonth(
            RentalRateType.PerKm, 5, new DateRange(D(1, 1), null), 2026, 2, D(2, 28), [], (_, _) => null);
        Assert.True(pending[0].PendingUsage);
        Assert.Equal(0, pending[0].Amount);
    }

    [Fact]
    public void Month_outside_contract_yields_nothing()
    {
        var lines = RentalAccrualCalculator.CalculateMonth(
            RentalRateType.Monthly, 10_000, new DateRange(D(1, 1), D(2, 28)), 2026, 3, D(3, 31), [], (_, _) => null);
        Assert.Empty(lines);
    }
}
