using Fleet.Domain.Calculations;

namespace Fleet.Domain.Tests;

public class DepreciationCalculatorTests
{
    // 1,200,000 price, 120,000 residual, 5 years → 1,080,000 depreciable, 216,000/year, 18,000/month nominal
    private static readonly DepreciationInput Truck = new(1_200_000, 120_000, 60, new DateOnly(2024, 1, 1));

    [Fact]
    public void Nominal_monthly_and_annual()
    {
        Assert.Equal(18_000m, DepreciationCalculator.MonthlyNominal(Truck));
        Assert.Equal(216_000m, DepreciationCalculator.AnnualNominal(Truck));
    }

    [Fact]
    public void Fully_depreciated_at_end_of_life_equals_depreciable_and_book_equals_residual()
    {
        var end = DepreciationCalculator.WindowEnd(Truck);
        Assert.Equal(new DateOnly(2028, 12, 31), end);
        Assert.Equal(1_080_000m, DepreciationCalculator.AccumulatedAsOf(Truck, end));
        Assert.Equal(120_000m, DepreciationCalculator.BookValueAsOf(Truck, end.AddYears(3)));
    }

    [Fact]
    public void Nothing_before_start_date()
    {
        Assert.Equal(0, DepreciationCalculator.AccumulatedAsOf(Truck, new DateOnly(2023, 12, 31)));
        Assert.Equal(1_200_000m, DepreciationCalculator.BookValueAsOf(Truck, new DateOnly(2023, 6, 1)));
    }

    [Fact]
    public void Prorated_by_exact_days()
    {
        var total = DepreciationCalculator.TotalDays(Truck); // 1827 days (2024 & 2028 leap)
        Assert.Equal(1827, total);
        var jan = DepreciationCalculator.ForPeriod(Truck, new DateOnly(2024, 1, 1), new DateOnly(2024, 1, 31));
        Assert.Equal(Money.Round(1_080_000m * 31 / 1827), jan);
    }

    [Fact]
    public void Mid_month_start_counts_only_remaining_days()
    {
        var input = Truck with { StartDate = new DateOnly(2024, 1, 20) };
        var jan = DepreciationCalculator.ForPeriod(input, new DateOnly(2024, 1, 1), new DateOnly(2024, 1, 31));
        var total = DepreciationCalculator.TotalDays(input);
        Assert.Equal(Money.Round(1_080_000m * 12 / total), jan);
    }

    [Fact]
    public void Disposal_stops_depreciation()
    {
        var input = Truck with { DisposalDate = new DateOnly(2024, 12, 31) };
        var after = DepreciationCalculator.ForPeriod(input, new DateOnly(2025, 1, 1), new DateOnly(2025, 12, 31));
        Assert.Equal(0, after);
        Assert.Equal(DepreciationCalculator.AccumulatedAsOf(Truck, new DateOnly(2024, 12, 31)),
            DepreciationCalculator.AccumulatedAsOf(input, new DateOnly(2030, 1, 1)));
    }

    [Fact]
    public void Monthly_schedule_sums_to_accumulated_without_drift()
    {
        var rows = DepreciationCalculator.MonthlySchedule(Truck, new DateOnly(2024, 1, 1), new DateOnly(2028, 12, 31));
        Assert.Equal(60, rows.Count);
        Assert.Equal(1_080_000m, rows.Sum(r => r.Depreciation));
        Assert.Equal(120_000m, rows[^1].BookValue);
    }

    [Fact]
    public void Residual_above_price_yields_zero()
    {
        var input = Truck with { ResidualValue = 2_000_000 };
        Assert.Equal(0, DepreciationCalculator.AccumulatedAsOf(input, new DateOnly(2026, 1, 1)));
    }
}
